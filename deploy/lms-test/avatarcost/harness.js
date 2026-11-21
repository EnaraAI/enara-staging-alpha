// In-page harness for the avatar cost run (loaded into a page on the
// lms-test.enara.app origin, after the Anam UMD bundle). It does what
// frontend/components/enara/LiveAvatarModal.tsx does in Anam mode (speech
// 'avatar'): start our session, connect Anam with the session token, and on
// each learner turn Anam transcribes, post the history to /api/avatar/query-stream
// and stream our answer into Anam's talk stream; heartbeat once a minute; at
// the end stop Anam and DELETE our session. The microphone is a WebAudio
// stream: each synthetic sentence is played once the avatar has finished its
// reply, so the end of every sentence is known exactly.
// Nothing secret is ever returned or logged: the learner token stays in this closure.
(() => {
  const now = () => performance.now();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function runCall(cfg) {
    const { token, sessionBody, sentences, maxReplyMs = 25000, settleMs = 1500 } = cfg;
    const { createClient, AnamEvent } = window.anam;
    const api = (path, init = {}) =>
      fetch(`/api/avatar${path}`, {
        method: init.method || 'GET',
        headers: { Authorization: `Bearer ${token}`, ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
    const out = { ok: false, events: [], turns: [], queries: [], errors: [], speech: null, sessionId: null };
    const ev = (name, extra = {}) => out.events.push({ t: Math.round(now()), name, ...extra });
    const T0 = now();
    out.t0Epoch = Date.now();

    // --- our session
    const startedAt = now();
    const res = await api('/session', { method: 'POST', body: sessionBody });
    out.sessionStartMs = Math.round(now() - startedAt);
    if (!res.ok) {
      let code = null;
      try { const j = await res.json(); code = j.code || j.error?.code || j.error || null; } catch {}
      out.errors.push(`session_start_http_${res.status}${code ? `_${String(code).slice(0, 60)}` : ''}`);
      return out;
    }
    const data = await res.json();
    out.sessionId = data.session_id;
    out.speech = data.speech;
    out.provider = data.provider;
    out.pronunciation = data.pronunciation;
    const sessionCreatedAt = startedAt;
    if (data.speech !== 'avatar' || !data.session_token) {
      // Server-voice (ElevenLabs) mode is not what this run measures: end at once.
      out.errors.push(`unexpected_speech_mode_${data.speech}`);
      await api(`/session/${data.session_id}`, { method: 'DELETE' }).catch(() => {});
      out.endedAfterMs = Math.round(now() - sessionCreatedAt);
      return out;
    }

    // --- microphone: WebAudio -> MediaStream
    const ctx = new AudioContext({ sampleRate: 48000 });
    await ctx.resume();
    const dest = ctx.createMediaStreamDestination();
    // A whisper of noise keeps the track "live" (pure digital silence can look like a dead mic).
    const noise = ctx.createBufferSource();
    const nb = ctx.createBuffer(1, 48000 * 2, 48000);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * 0.0005;
    noise.buffer = nb; noise.loop = true; noise.connect(dest); noise.start();
    const buffers = [];
    for (const s of sentences) {
      const bin = Uint8Array.from(atob(s.b64), (c) => c.charCodeAt(0));
      buffers.push(await ctx.decodeAudioData(bin.buffer));
    }

    // --- persona audio level (speaking onset/offset)
    let personaSpeaking = false;
    let lastLoudAt = 0;
    const onsets = [];
    const offsets = [];
    let levelTimer = null;
    const watchLevel = (stream) => {
      try {
        const el = document.createElement('audio');
        el.srcObject = stream; el.muted = true; el.play().catch(() => {});
        document.body.appendChild(el);
        const src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser();
        an.fftSize = 1024;
        src.connect(an);
        const buf = new Float32Array(an.fftSize);
        levelTimer = setInterval(() => {
          an.getFloatTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          const rms = Math.sqrt(sum / buf.length);
          const t = now();
          if (rms > 0.01) {
            lastLoudAt = t;
            if (!personaSpeaking) { personaSpeaking = true; onsets.push(t); ev('persona_audio_on'); }
          } else if (personaSpeaking && t - lastLoudAt > 700) {
            personaSpeaking = false; offsets.push(lastLoudAt); ev('persona_audio_off');
          }
        }, 20);
      } catch (e) {
        out.errors.push(`level_watch_${e?.name || 'error'}`);
      }
    };

    // --- Anam client (direct, no relay)
    const client = createClient(data.session_token, {});
    let ready = false;
    let closed = null;
    const userMsgs = []; // {t, content}
    const personaStreamFirst = []; // first persona stream event times
    let lastPersonaStreamId = null;
    let answering = false;
    let lastKey = '';
    let heartbeat = null;
    const providerIds = new Set();

    client.addListener(AnamEvent.CONNECTION_ESTABLISHED, () => ev('connection_established'));
    client.addListener(AnamEvent.SESSION_READY, () => {
      ready = true; ev('session_ready');
      const beat = () => {
        let pid = null;
        try { pid = client.getActiveSessionId(); } catch {}
        if (pid) providerIds.add(pid);
        api(`/session/${data.session_id}/heartbeat`, { method: 'POST', body: { provider_session_id: pid } }).catch(() => {});
      };
      beat();
      heartbeat = setInterval(beat, 60000);
    });
    client.addListener(AnamEvent.AUDIO_STREAM_STARTED, (stream) => { ev('audio_stream_started'); watchLevel(stream); });
    client.addListener(AnamEvent.USER_SPEECH_STARTED, () => ev('user_speech_started'));
    client.addListener(AnamEvent.USER_SPEECH_ENDED, () => ev('user_speech_ended'));
    client.addListener(AnamEvent.TALK_STREAM_INTERRUPTED, () => { ev('talk_interrupted'); answering = false; });
    client.addListener(AnamEvent.CONNECTION_CLOSED, (reason, details) => { closed = String(reason); ev('connection_closed', { reason: String(reason).slice(0, 120), details: details ? String(details).slice(0, 300) : null }); });
    client.addListener(AnamEvent.SERVER_WARNING, (m) => ev('server_warning', { m: String(m).slice(0, 200) }));
    client.addListener(AnamEvent.MESSAGE_DELIVERY_FAILED, (f) => ev('delivery_failed', { f: JSON.stringify(f).slice(0, 200) }));
    client.addListener(AnamEvent.MIC_PERMISSION_DENIED, (m) => ev('mic_denied', { m: String(m).slice(0, 200) }));
    client.addListener(AnamEvent.INPUT_AUDIO_STREAM_STARTED, () => ev('input_audio_started'));
    client.addListener(AnamEvent.VIDEO_STREAM_STARTED, () => ev('video_stream_started'));
    client.addListener(AnamEvent.DATA_CHANNEL_OPEN, () => ev('data_channel_open'));
    client.addListener(AnamEvent.MESSAGE_STREAM_EVENT_RECEIVED, (m) => {
      if (m.role !== 'user' && m.id !== lastPersonaStreamId) { lastPersonaStreamId = m.id; personaStreamFirst.push(now()); ev('persona_stream_first'); }
    });
    client.addListener(AnamEvent.MESSAGE_HISTORY_UPDATED, async (history) => {
      const last = history?.[history.length - 1];
      if (!last || last.role !== 'user' || !last.content?.trim()) return;
      const key = `${history.length}:${last.content.trim()}`;
      if (key === lastKey) return;
      lastKey = key;
      userMsgs.push({ t: now(), content: last.content });
      ev('user_message', { n: userMsgs.length });
      if (answering) { out.errors.push('turn_while_answering'); return; }
      answering = true;
      const q = { t: now(), status: null, firstLineMs: null, firstContentMs: null, totalMs: null, chars: 0 };
      out.queries.push(q);
      let talk = null;
      try {
        talk = client.createTalkMessageStream();
        const messages = history.map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
        const r = await api('/query-stream', { method: 'POST', body: { session_id: data.session_id, messages } });
        q.status = r.status;
        if (!r.ok || !r.body) throw new Error(`query_${r.status}`);
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        const line = (s) => {
          if (!s) return;
          q.firstLineMs ??= Math.round(now() - q.t);
          const d = JSON.parse(s);
          if (d.content) {
            q.firstContentMs ??= Math.round(now() - q.t);
            q.chars += d.content.length;
            q.reply = (q.reply || '') + d.content;
            if (talk?.isActive()) talk.streamMessageChunk(d.content, false);
          }
          if (d.language_switch) q.languageSwitch = d.language_switch;
          if (d.visual) q.visual = true;
        };
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';
          for (const l of lines) line(l.trim());
        }
        line(buf.trim());
        q.totalMs = Math.round(now() - q.t);
        if (talk?.isActive()) talk.endMessage();
      } catch (e) {
        out.errors.push(String(e?.message || e?.name || 'query_failed').slice(0, 80));
        try { if (talk?.isActive()) talk.endMessage(); } catch {}
      } finally {
        answering = false;
      }
    });

    const video = document.createElement('video');
    video.id = 'avc-video'; video.autoplay = true; video.playsInline = true; video.muted = true;
    document.body.appendChild(video);
    try {
      await client.streamToVideoElement('avc-video', dest.stream);
    } catch (e) {
      out.errors.push(`stream_start_${String(e?.message || e?.name || 'error').slice(0, 80)}`);
    }
    const readyBy = now() + 30000;
    while (!ready && !closed && now() < readyBy) await sleep(100);
    out.readyMs = ready ? Math.round(now() - sessionCreatedAt) : null;

    // --- the script: each sentence after the avatar is quiet
    const waitQuiet = async (deadline) => {
      while (now() < deadline) {
        if (!answering && !personaSpeaking && now() - lastLoudAt > settleMs) return true;
        await sleep(100);
      }
      return false;
    };
    if (ready && !closed) {
      await sleep(1500);
      for (let i = 0; i < buffers.length && !closed; i++) {
        await waitQuiet(now() + maxReplyMs);
        const src = ctx.createBufferSource();
        src.buffer = buffers[i];
        src.connect(dest);
        const startAt = now();
        src.start();
        const endAt = startAt + buffers[i].duration * 1000;
        const turn = { i, text: sentences[i].text, startT: Math.round(startAt), endT: Math.round(endAt), audioSec: Math.round(buffers[i].duration * 100) / 100 };
        out.turns.push(turn);
        ev('sentence_start', { i });
        await sleep(buffers[i].duration * 1000);
        ev('sentence_end', { i });
        // Wait for a reply to start, then for it to finish (max maxReplyMs after the sentence ended).
        const deadline = endAt + maxReplyMs;
        while (now() < deadline && !closed) {
          if (onsets.some((t) => t > endAt) && !personaSpeaking && !answering && now() - lastLoudAt > settleMs) break;
          await sleep(100);
        }
      }
      await sleep(1000);
    }

    // --- per-turn numbers
    for (let k = 0; k < out.turns.length; k++) {
      const turn = out.turns[k];
      const nextStart = out.turns[k + 1]?.startT ?? Infinity;
      const onset = onsets.find((t) => t > turn.endT && t < nextStart);
      turn.replyAudioLatencyMs = onset !== undefined ? Math.round(onset - turn.endT) : null;
      const ps = personaStreamFirst.find((t) => t > turn.endT && t < nextStart);
      turn.replyTextEventLatencyMs = ps !== undefined ? Math.round(ps - turn.endT) : null;
      const heard = userMsgs.filter((m) => m.t > turn.startT && m.t < nextStart);
      turn.heard = heard.map((m) => m.content).join(' ').trim();
      turn.heardMessages = heard.length;
      turn.transcriptLatencyMs = heard.length ? Math.round(heard[0].t - turn.endT) : null;
      const qs = out.queries.filter((q) => q.t > turn.startT && q.t < nextStart);
      turn.queries = qs.map((q) => ({ status: q.status, firstContentMs: q.firstContentMs, totalMs: q.totalMs, chars: q.chars }));
      turn.replyText = qs.map((q) => q.reply || '').join(' ').slice(0, 400);
    }

    // --- end cleanly: stop Anam, then our end endpoint (metering)
    if (heartbeat) clearInterval(heartbeat);
    if (levelTimer) clearInterval(levelTimer);
    try { await client.stopStreaming(); } catch {}
    const del = await api(`/session/${data.session_id}`, { method: 'DELETE' }).catch(() => null);
    out.endStatus = del ? del.status : null;
    out.durationSec = Math.round((now() - sessionCreatedAt) / 100) / 10;
    out.anamConnectedSec = out.readyMs !== null ? Math.round((now() - sessionCreatedAt - out.readyMs) / 100) / 10 : 0;
    out.providerSessions = providerIds.size;
    out.closedReason = closed;
    out.userMessages = userMsgs.length;
    try { ctx.close(); } catch {}
    out.ok = Boolean(ready && out.turns.length === sentences.length && !closed);
    // Times relative to T0 for the record.
    for (const e of out.events) e.t = Math.round(e.t - T0);
    for (const t of out.turns) { t.startT = Math.round(t.startT - T0); t.endT = Math.round(t.endT - T0); }
    for (const q of out.queries) { q.t = Math.round(q.t - T0); delete q.reply; }
    return out;
  }

  window.__avc = { runCall };
})();
