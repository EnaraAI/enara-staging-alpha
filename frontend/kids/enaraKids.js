/* Enara Kids components. GENERATED from the Enara Kids Design System (components/bundle.js); edit there and regenerate. */
/* eslint-disable */
import React from 'react';
  var h = React.createElement, useState = React.useState, useRef = React.useRef, useEffect = React.useEffect, Fragment = React.Fragment;
  var MARK_WHITE = '/kids/enara-mark-white.svg';

  /* ---------- language helpers ---------- */
  var DIG = '٠١٢٣٤٥٦٧٨٩';
  /** 'ar' (Modern Standard Arabic) and 'ar-EG' (Egyptian Arabic) both read right to left with Arabic-Indic digits. */
  function isAr(lang) { return lang === 'ar' || lang === 'ar-EG' || lang === 'arz'; }
  /** List separator: the Arabic comma in Arabic, because a middle dot looks like the Arabic-Indic zero. */
  function sep(lang) { return isAr(lang) ? '، ' : ' · '; }
  function isEg(lang) { return lang === 'ar-EG' || lang === 'arz'; }
  /** Write a number (or any string's digits) in the reader's digits: Arabic-Indic in Arabic. */
  function digits(v, lang) { v = v == null ? '' : String(v); return isAr(lang) ? v.replace(/[0-9]/g, function (d) { return DIG[d]; }) : v; }
  function tr(lang) { return function (en, ar) { return isAr(lang) ? ar : en; }; }
  function nr(lang) { return function (v) { return digits(v, lang); }; }
  function dateLabel(d, lang, opts) {
    if (!d) return '';
    try { return new Date(d).toLocaleDateString(isAr(lang) ? 'ar-EG' : 'en-GB', Object.assign({ weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }, opts || {})); }
    catch (e) { return digits(d, lang); }
  }
  /** Stars a child sees instead of a score percentage: finishing always earns 1. */
  function starsFor(score) { return score == null ? 0 : score >= 85 ? 3 : score >= 60 ? 2 : 1; }
  function dirOf(lang) { return isAr(lang) ? 'rtl' : undefined; }

  /* ---------- Praise and encouragement ---------- */
  /** Phrases for each moment a child gets feedback. Praise effort, strategy and progress; never compare children. */
  var PRAISE = {
    correct: {
      en: ['Great job!', 'You got it!', 'Brilliant!', 'Super work!', 'Yes! That’s right!', 'Spot on!', 'Nailed it!'],
      ar: ['أحسنت!', 'إجابة صحيحة!', 'رائع!', 'عمل ممتاز!', 'نعم! هذا صحيح!', 'إجابة موفّقة!', 'برافو عليك!'] },
    correctAfterTry: {
      en: ['You kept trying, and you got it!', 'You didn’t give up. Well done!', 'Try, think, get it. That’s how learning works!', 'Your hard work paid off!'],
      ar: ['حاولت ولم تستسلم، وها أنت نجحت!', 'لم تستسلم. أحسنت!', 'حاول وفكّر وانجح، هكذا نتعلّم!', 'تعبك أثمر!'] },
    tryAgain: {
      en: ['Almost! Have another look.', 'Good thinking! Try once more.', 'Mistakes help your brain grow.', 'You’re getting closer!', 'Take your time. You can do it!'],
      ar: ['اقتربت! انظر مرة أخرى.', 'تفكير جيد! جرّب مرة أخرى.', 'الأخطاء تجعل عقلك أقوى.', 'أنت تقترب!', 'خذ وقتك، أنت تستطيع!'] },
    streak: {
      en: ['{n} right in a row! Keep going!', 'Wow, {n} in a row!', '{n} in a row! You’re on a roll!'],
      ar: ['{n} إجابات صحيحة متتالية! استمر!', 'واو، {n} على التوالي!', '{n} على التوالي! أنت منطلق!'] },
    lessonDone: {
      en: ['Lesson done! You should be proud.', 'You learned something new today!', 'Another lesson finished. Great work!'],
      ar: ['انتهى الدرس! كن فخورًا بنفسك.', 'تعلّمت شيئًا جديدًا اليوم!', 'درس آخر انتهى. عمل رائع!'] },
    quiz3: {
      en: ['Amazing work!', 'Wow, what a quiz!', 'Outstanding effort!'],
      ar: ['عمل مذهل!', 'واو، يا له من اختبار!', 'مجهود رائع!'] },
    quiz2: {
      en: ['Well done! You’re getting stronger.', 'Great effort! You learned a lot.', 'Nice work! You’re nearly there.'],
      ar: ['أحسنت! أنت تزداد قوة.', 'مجهود رائع! تعلّمت الكثير.', 'عمل جميل! أنت قريب جدًا.'] },
    quiz1: {
      en: ['You finished! Every quiz helps you learn.', 'Good effort! Let’s practise a bit more together.', 'You did it! Practice makes it easier.'],
      ar: ['أنهيت الاختبار! كل اختبار يساعدك على التعلّم.', 'مجهود جيد! لنتدرّب أكثر معًا.', 'لقد فعلتها! التدريب يجعلها أسهل.'] },
    handedIn: {
      en: ['You handed it in. Great effort!', 'Homework done. Well done for finishing!', 'All handed in. You worked hard!'],
      ar: ['سلّمته. مجهود رائع!', 'انتهى الواجب. أحسنت لأنك أكملته!', 'سلّمت كل شيء. لقد عملت بجد!'] },
    welcome: {
      en: ['Great to see you again!', 'Ready for something new?', 'Your brain loves learning. Let’s go!', 'Let’s learn something amazing today!'],
      ar: ['سعيدون برؤيتك مجددًا!', 'مستعد لشيء جديد؟', 'عقلك يحب التعلّم. هيا بنا!', 'لنتعلّم شيئًا مدهشًا اليوم!'] },
    skillUp: {
      en: ['Your skill is growing!', 'Look how far you’ve come!', 'You’re getting better every day!'],
      ar: ['مهارتك تكبر!', 'انظر كم تقدّمت!', 'أنت تتحسّن كل يوم!'] },
    checkDone: {
      en: ['You did your best. That’s what counts!', 'Thanks for trying your best!'],
      ar: ['بذلت أفضل ما عندك، وهذا ما يهم!', 'شكرًا لأنك بذلت جهدك!'] },
    speakingDone: {
      en: ['Great talking! Your teacher will love listening.', 'You spoke so clearly. Well done!'],
      ar: ['تحدّثت بشكل رائع! سيحب معلّمك الاستماع.', 'تكلّمت بوضوح. أحسنت!'] },
    planDone: {
      en: ['One step done!', 'Done! Nice work.', 'Ticked off. Great job!'],
      ar: ['خطوة انتهت!', 'تمّ! عمل جميل.', 'أنجزتها. أحسنت!'] },
    askHelp: {
      en: ['Asking for help is smart!', 'Good idea to ask!'],
      ar: ['طلب المساعدة تصرّف ذكي!', 'فكرة جيدة أن تسأل!'] }
  };
  /* Egyptian Arabic versions of every praise phrase (used when lang is 'ar-EG'). */
  var PRAISE_EG = {
    correct: ['برافو عليك!', 'صح كده!', 'جامد جدًا!', 'شغل عالي!', 'أيوه كده! إجابة صح!', 'بالظبط كده!', 'عاش!'],
    correctAfterTry: ['ما استسلمتش وجبتها في الآخر!', 'فضلت تحاول لحد ما وصلت. برافو!', 'حاول وفكّر وهتوصل، وأهو وصلت!', 'تعبك جاب نتيجة!'],
    tryAgain: ['قرّبت خالص! بص تاني.', 'تفكير حلو! جرّب كمان مرة.', 'الغلط بيخلّي مخك أقوى.', 'إنت بتقرّب!', 'خد وقتك، إنت تقدر!'],
    streak: ['{n} صح ورا بعض! كمّل!', 'واو، {n} ورا بعض!', '{n} ورا بعض! إنت ماشي زي الصاروخ!'],
    lessonDone: ['الدرس خلص! لازم تبقى فخور بنفسك.', 'اتعلّمت حاجة جديدة النهارده!', 'درس كمان خلص. شغل جامد!'],
    quiz3: ['شغل خرافي!', 'واو، إيه الاختبار الحلو ده!', 'مجهود جبّار!'],
    quiz2: ['برافو! إنت بتقوى كل يوم.', 'مجهود حلو! اتعلّمت كتير.', 'شغل حلو! فاضلك حاجة صغيرة.'],
    quiz1: ['خلّصت الاختبار! كل اختبار بيعلّمك حاجة.', 'مجهود كويس! يلا نتمرّن شوية مع بعض.', 'عملتها! التمرين بيسهّلها.'],
    handedIn: ['سلّمته. مجهود جامد!', 'الواجب خلص. برافو إنك كمّلته!', 'سلّمت كل حاجة. إنت تعبت وتستاهل!'],
    welcome: ['وحشتنا! أهلًا بيك تاني.', 'جاهز لحاجة جديدة؟', 'مخك بيحب يتعلّم. يلا بينا!', 'يلا نتعلّم حاجة حلوة النهارده!'],
    skillUp: ['مهارتك بتكبر!', 'شوف إنت وصلت لفين!', 'إنت بتتحسّن كل يوم!'],
    checkDone: ['عملت اللي عليك، وده المهم!', 'شكرًا إنك عملت أحسن ما عندك!'],
    speakingDone: ['كلامك كان حلو! مدرّسك هيحب يسمعك.', 'اتكلّمت بوضوح. برافو!'],
    planDone: ['خطوة خلصت!', 'تمام! شغل حلو.', 'خلّصتها. برافو!'],
    askHelp: ['إنك تطلب مساعدة ده تصرّف ذكي!', 'فكرة حلوة إنك تسأل!']
  };
  Object.keys(PRAISE_EG).forEach(function (k) { PRAISE[k].eg = PRAISE_EG[k]; });
  function seedOf(v) { var s = String(v == null ? '' : v), n = 0; for (var i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) | 0; return Math.abs(n); }
  /** One phrase for a moment. The same seed always gives the same phrase, so it doesn't change on re-render; vary the seed (question id, day) for variety. */
  function cheer(moment, lang, seed, vars) {
    var m = PRAISE[moment] || PRAISE.correct, list = (isEg(lang) && m.eg) || m[isAr(lang) ? 'ar' : 'en'];
    var t = list[seedOf(seed) % list.length];
    if (vars && vars.n != null) t = t.replace('{n}', digits(vars.n, lang));
    return t;
  }
  /** Enara Kids is only for student accounts the school marks as kids learners. */
  function isKidsStudent(user) {
    return !!user && user.role === 'student' && (user.uiMode === 'kids' || user.kids === true);
  }

  function cx() { return Array.prototype.filter.call(arguments, Boolean).join(' '); }
  function omit(p, keys) { var o = {}; for (var k in p) if (keys.indexOf(k) < 0) o[k] = p[k]; return o; }

  /* ---------- Icon ---------- */
  var PATHS = {
    check: [['path', { d: 'M20 6 9 17l-5-5' }]],
    retry: [['path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }], ['path', { d: 'M3 3v5h5' }]],
    star: [['polygon', { points: '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2' }]],
    arrowRight: [['path', { d: 'M5 12h14' }], ['path', { d: 'm12 5 7 7-7 7' }]],
    arrowLeft: [['path', { d: 'M19 12H5' }], ['path', { d: 'm12 19-7-7 7-7' }]],
    chevronRight: [['path', { d: 'm9 18 6-6-6-6' }]],
    chevronLeft: [['path', { d: 'm15 18-6-6 6-6' }]],
    volume: [['path', { d: 'M11 5 6 9H2v6h4l5 4V5z' }], ['path', { d: 'M16 9a5 5 0 0 1 0 6' }], ['path', { d: 'M19.4 18.4a9 9 0 0 0 0-12.8' }]],
    lock: [['rect', { x: 4, y: 11, width: 16, height: 10, rx: 2 }], ['path', { d: 'M8 11V7a4 4 0 0 1 8 0v4' }]],
    play: [['polygon', { points: '7 4 19 12 7 20 7 4' }]],
    flame: [['path', { d: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z' }]],
    close: [['path', { d: 'M18 6 6 18' }], ['path', { d: 'm6 6 12 12' }]],
    hint: [['path', { d: 'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5' }], ['path', { d: 'M9 18h6' }], ['path', { d: 'M10 22h4' }]],
    book: [['path', { d: 'M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20' }]],
    home: [['path', { d: 'M3 10.5 12 3l9 7.5' }], ['path', { d: 'M5 9v12h14V9' }]],
    clipboard: [['rect', { x: 8, y: 2, width: 8, height: 4, rx: 1 }], ['path', { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' }], ['path', { d: 'm9 14 2 2 4-4' }]],
    calendar: [['rect', { x: 3, y: 4, width: 18, height: 18, rx: 2 }], ['path', { d: 'M16 2v4' }], ['path', { d: 'M8 2v4' }], ['path', { d: 'M3 10h18' }]],
    pencil: [['path', { d: 'M21.17 6.81a1 1 0 0 0-3.98-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z' }], ['path', { d: 'm15 5 4 4' }]],
    trophy: [['path', { d: 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6' }], ['path', { d: 'M18 9h1.5a2.5 2.5 0 0 0 0-5H18' }], ['path', { d: 'M4 22h16' }], ['path', { d: 'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22' }], ['path', { d: 'M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22' }], ['path', { d: 'M18 2H6v7a6 6 0 0 0 12 0V2Z' }]],
    sprout: [['path', { d: 'M7 20h10' }], ['path', { d: 'M10 20c5.5-2.5.8-6.4 3-10' }], ['path', { d: 'M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z' }], ['path', { d: 'M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z' }]],
    mic: [['rect', { x: 9, y: 2, width: 6, height: 12, rx: 3 }], ['path', { d: 'M19 10v2a7 7 0 0 1-14 0v-2' }], ['path', { d: 'M12 19v3' }]],
    message: [['path', { d: 'M7.9 20A9 9 0 1 0 4 16.1L2 22Z' }]],
    send: [['path', { d: 'm22 2-7 20-4-9-9-4Z' }], ['path', { d: 'M22 2 11 13' }]],
    stop: [['rect', { x: 6, y: 6, width: 12, height: 12, rx: 2 }]],
    logout: [['path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }], ['path', { d: 'm16 17 5-5-5-5' }], ['path', { d: 'M21 12H9' }]],
    eye: [['path', { d: 'M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0' }], ['circle', { cx: 12, cy: 12, r: 3 }]],
    eyeOff: [['path', { d: 'M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0' }], ['path', { d: 'm3 3 18 18' }]],
    download: [['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }], ['path', { d: 'm7 10 5 5 5-5' }], ['path', { d: 'M12 15V3' }]],
    video: [['path', { d: 'm16 13 5.22 3.48a.5.5 0 0 0 .78-.42V7.87a.5.5 0 0 0-.75-.43L16 10.5' }], ['rect', { x: 2, y: 6, width: 14, height: 12, rx: 2 }]],
    compass: [['circle', { cx: 12, cy: 12, r: 10 }], ['polygon', { points: '16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76' }]],
    history: [['path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }], ['path', { d: 'M3 3v5h5' }], ['path', { d: 'M12 7v5l4 2' }]],
    image: [['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }], ['circle', { cx: 9, cy: 9, r: 2 }], ['path', { d: 'm21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21' }]],
    target: [['circle', { cx: 12, cy: 12, r: 10 }], ['circle', { cx: 12, cy: 12, r: 6 }], ['circle', { cx: 12, cy: 12, r: 2 }]],
    user: [['circle', { cx: 12, cy: 8, r: 5 }], ['path', { d: 'M20 21a8 8 0 0 0-16 0' }]],
    mail: [['rect', { x: 2, y: 4, width: 20, height: 16, rx: 2 }], ['path', { d: 'm22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7' }]],
    flag: [['path', { d: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z' }], ['path', { d: 'M4 22v-7' }]],
    hourglass: [['path', { d: 'M5 22h14' }], ['path', { d: 'M5 2h14' }], ['path', { d: 'M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22' }], ['path', { d: 'M7 2v4.17a2 2 0 0 0 .59 1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2' }]],
    file: [['path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }], ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }]]
  };
  function Icon(p) {
    var parts = PATHS[p.name] || [];
    return h('svg', {
      className: cx('ek-icon', (p.name === 'arrowRight' || p.name === 'arrowLeft' || p.name === 'chevronRight' || p.name === 'chevronLeft') && 'ek-icon--dir', p.className),
      viewBox: '0 0 24 24', fill: p.filled ? 'currentColor' : 'none', stroke: 'currentColor', strokeWidth: 2.5,
      strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
      style: p.size ? { width: p.size, height: p.size } : undefined
    }, parts.map(function (e, i) { return h(e[0], Object.assign({ key: i }, e[1])); }));
  }
  function Mark(p) { return h('span', { className: cx('ek-mark', p.className) }, h('img', { src: p.src || MARK_WHITE, alt: p.alt || '' })); }

  /* ---------- Button ---------- */
  function Button(p) {
    var variant = p.variant || 'blue';
    var iconOnly = p.icon && (p.children == null || p.children === '');
    var rest = omit(p, ['variant', 'size', 'icon', 'iconEnd', 'label', 'children', 'className']);
    return h('button', Object.assign({
      type: 'button',
      className: cx('ek-btn', variant !== 'blue' && 'ek-btn--' + variant, p.size === 'lg' && 'ek-btn--lg', p.size === 'sm' && 'ek-btn--sm', iconOnly && 'ek-btn--round', p.className),
      'aria-label': iconOnly ? p.label : p['aria-label']
    }, rest), p.icon && h(Icon, { name: p.icon }), iconOnly ? null : p.children, p.iconEnd && h(Icon, { name: p.iconEnd }));
  }

  /* ---------- AnswerChoice / ChoiceGroup ---------- */
  function AnswerChoice(p) {
    var T = tr(p.lang);
    var eg = isEg(p.lang);
    var st = p.status === 'correct' ? { icon: 'check', text: eg ? 'برافو!' : T('Great job!', 'أحسنت!') } : p.status === 'tryagain' ? { icon: 'retry', text: eg ? 'جرّب تاني' : T('Try again', 'حاول مرة أخرى') } : p.status === 'answer' ? { icon: 'check', text: T('Right answer', 'الإجابة الصحيحة') } : null;
    return h('button', {
      type: 'button', role: 'radio', 'aria-checked': !!p.selected, tabIndex: p.tabIndex,
      disabled: p.disabled, onClick: p.onSelect, onKeyDown: p.onKeyDown, ref: p.buttonRef,
      className: cx('ek-choice', (p.status === 'correct' || p.status === 'answer') && 'is-correct', p.status === 'tryagain' && 'is-tryagain', p.className)
    },
      p.letter && h('span', { className: 'ek-choice__key' }, p.letter),
      h('span', { className: 'ek-choice__text' }, p.children),
      st && h('span', { className: 'ek-choice__status' }, h(Icon, { name: st.icon }), p.statusText || st.text));
  }
  var LETTERS = { en: 'ABCDEFGH', ar: 'أبجدهوزح' };
  function ChoiceGroup(p) {
    var choices = p.choices || [], refs = useRef([]);
    var idx = choices.findIndex(function (c) { return c.id === p.value; });
    function move(i, d) {
      var n = (i + d + choices.length) % choices.length;
      if (p.onChange) p.onChange(choices[n].id);
      if (refs.current[n]) refs.current[n].focus();
    }
    return h('div', { role: 'radiogroup', 'aria-label': p.label, className: cx('ek-choices', p.columns === 2 && 'ek-choices--2', p.className) },
      choices.map(function (c, i) {
        var sel = c.id === p.value;
        var status = sel ? p.status : (p.reveal && c.id === p.reveal && p.status === 'tryagain' ? 'answer' : undefined);
        return h(AnswerChoice, {
          key: c.id, letter: p.letters === false ? null : LETTERS[isAr(p.lang) ? 'ar' : 'en'][i], selected: sel, lang: p.lang,
          status: status, disabled: p.locked,
          tabIndex: (idx < 0 ? i === 0 : sel) ? 0 : -1,
          buttonRef: function (el) { refs.current[i] = el; },
          onSelect: function () { if (p.onChange) p.onChange(c.id); },
          onKeyDown: function (e) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); move(i, 1); }
            if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); move(i, -1); }
          }
        }, c.text);
      }));
  }

  /* ---------- AnswerInput ---------- */
  function AnswerInput(p) {
    var rest = omit(p, ['label', 'hint', 'status', 'className', 'multiline', 'trailing', 'lang']);
    return h('label', { className: cx('ek-field', p.className) },
      h('span', { className: 'ek-field__label' }, p.label),
      h('span', { className: 'ek-field__row' },
        h(p.multiline ? 'textarea' : 'input', Object.assign({ className: cx('ek-input', p.multiline && 'ek-input--long', p.status && 'is-' + p.status), autoComplete: 'off', rows: p.multiline ? 4 : undefined }, rest)),
        p.trailing),
      p.hint && h('span', { className: 'ek-field__hint' }, p.hint));
  }

  /* ---------- ProgressTrail ---------- */
  function ProgressTrail(p) {
    var total = p.total || 5, cur = p.current || 0, items = [], T = tr(p.lang), N = nr(p.lang);
    for (var i = 0; i < total; i++) {
      var done = i < cur, isCur = i === cur, last = i === total - 1 && p.rewardLast !== false;
      items.push(h('li', {
        key: 's' + i, className: cx('ek-trail__step', done && 'is-done', isCur && 'is-current'),
        'aria-current': isCur ? 'step' : undefined,
        'aria-label': T('Question ' + (i + 1), 'السؤال ' + N(i + 1)) + (done ? T(', done', '، انتهى') : isCur ? T(', now', '، الآن') : '')
      }, done ? h(Icon, { name: 'check' }) : last && !isCur ? h(Icon, { name: 'star' }) : N(i + 1)));
      if (i < total - 1) items.push(h('li', { key: 'l' + i, className: cx('ek-trail__link', i < cur && 'is-done'), 'aria-hidden': true }));
    }
    var n = N(Math.min(cur + 1, total)), m = N(total);
    return h('div', { className: p.className },
      p.label !== false && h('span', { className: 'ek-trail__label' }, p.label || T('Question ' + n + ' of ' + m, 'السؤال ' + n + ' من ' + m)),
      h('ol', { className: 'ek-trail', 'aria-label': T('Progress', 'التقدّم') }, items));
  }

  /* ---------- FeedbackBar ---------- */
  function FeedbackBar(p) {
    if (!p.status) return null;
    var ok = p.status === 'correct', T = tr(p.lang);
    return h('div', { className: cx('ek-feedback', ok ? 'is-correct' : 'is-tryagain'), role: 'status', 'aria-live': 'polite' },
      h('span', { className: 'ek-feedback__badge' }, h(Icon, { name: ok ? 'check' : 'retry' })),
      h('div', { className: 'ek-feedback__text' },
        h('strong', null, p.title || cheer(ok ? 'correct' : 'tryAgain', p.lang, p.seed)),
        p.message && h('span', null, p.message)),
      ok ? (p.onContinue !== false && h(Button, { size: 'lg', iconEnd: 'arrowRight', onClick: p.onContinue }, p.continueLabel || T('Next', 'التالي')))
         : (p.onRetry !== false && h(Button, { variant: p.retryVariant || 'coral', size: 'lg', icon: p.retryIcon === undefined ? 'retry' : p.retryIcon, iconEnd: p.retryIconEnd, onClick: p.onRetry }, p.retryLabel || T('Try again', 'حاول مرة أخرى'))));
  }

  /* ---------- TutorBubble ---------- */
  function TutorBubble(p) {
    var child = p.from === 'child', T = tr(p.lang);
    return h('div', { className: cx('ek-bubble', child && 'ek-bubble--child', p.className), dir: p.dir, lang: p.lang },
      !child && h(Mark, { className: 'ek-bubble__avatar', src: p.avatarSrc }),
      h('div', { className: 'ek-bubble__body' },
        p.name !== false && h('span', { className: 'ek-bubble__name' }, p.name || (child ? T('You', 'أنت') : T('Enara', 'إنارة'))),
        p.children),
      p.onReadAloud && h(Button, { variant: 'sun', icon: 'volume', label: T('Read aloud', 'استمع'), onClick: p.onReadAloud, className: 'ek-bubble__listen' }));
  }

  /* ---------- Sticker / StarRating ---------- */
  function Sticker(p) {
    var color = p.color || 'sun';
    return h('span', { className: cx('ek-sticker', color !== 'sun' && 'ek-sticker--' + color, p.count != null && 'ek-sticker--disc', p.locked && 'is-locked', p.className) },
      p.locked ? h(Icon, { name: 'lock' }) : p.icon && h(Icon, { name: p.icon }),
      p.count != null && h('strong', null, digits(p.count, p.lang)), p.children);
  }
  function StarRating(p) {
    var of = p.of || 3, n = p.stars || 0, s = [], T = tr(p.lang), N = nr(p.lang);
    for (var i = 0; i < of; i++) s.push(h('span', { key: i, className: cx('ek-stars__star', i < n && 'is-on', i === 1 && 'is-mid') }, h(Icon, { name: 'star', filled: i < n })));
    return h('div', { className: cx('ek-stars', p.size === 'lg' && 'ek-stars--lg', p.size === 'sm' && 'ek-stars--sm', p.className), role: 'img', 'aria-label': T(n + ' of ' + of + ' stars', N(n) + ' من ' + N(of) + ' نجوم') }, s);
  }

  /* ---------- Cheer: a praise moment ---------- */
  function Cheer(p) {
    var text = p.children || cheer(p.moment || 'correct', p.lang, p.seed, { n: p.n });
    return h('div', { className: cx('ek-cheer', p.className), role: 'status', 'aria-live': 'polite' },
      h('span', { className: 'ek-cheer__burst', 'aria-hidden': true }, h(Icon, { name: p.icon || 'star', filled: true })),
      h('span', { className: 'ek-cheer__text' }, text));
  }

  /* ---------- SkillBadge: one vocabulary for every level ---------- */
  var LEVELS = {
    not_assessed: { n: 0, en: 'Not tried yet', ar: 'لم تجرّبها بعد', tone: 'none' },
    emerging: { n: 1, en: 'Just starting', ar: 'في البداية', tone: 'bubblegum' },
    developing: { n: 2, en: 'Growing', ar: 'تكبر', tone: 'sun' },
    proficient: { n: 3, en: 'Strong', ar: 'قوية', tone: 'blue' },
    mastered: { n: 4, en: 'Star skill', ar: 'مهارة نجمة', tone: 'leaf' }
  };
  function SkillBadge(p) {
    var L = LEVELS[p.level] || LEVELS.not_assessed, dots = [];
    for (var i = 0; i < 4; i++) dots.push(h('i', { key: i, className: i < L.n ? 'is-on' : '' }));
    return h('span', { className: cx('ek-skill', 'ek-skill--' + L.tone, p.className) },
      h('span', { className: 'ek-skill__dots', 'aria-hidden': true }, dots), isAr(p.lang) ? L.ar : L.en);
  }

  /* ---------- StatusChip: assignment statuses in kid words ---------- */
  var STATUSES = {
    not_started: ['New', 'جديد', 'blue'], in_progress: ['Started', 'بدأته', 'sun'],
    submitted: ['Handed in', 'سلّمته', 'sky'], grading: ['Handed in', 'سلّمته', 'sky'], grading_delayed: ['Handed in', 'سلّمته', 'sky'],
    awaiting_review: ['Handed in', 'سلّمته', 'sky'], graded: ['Handed in', 'سلّمته', 'sky'],
    released: ['Results ready!', 'النتيجة جاهزة!', 'leaf'], missing: ['Not handed in', 'لم تسلّمه', 'coral'],
    open: ['Ready', 'جاهز', 'blue'], closed: ['Closed', 'مغلق', 'none'], upcoming: ['Not open yet', 'لم يُفتح بعد', 'none']
  };
  function StatusChip(p) {
    var s = STATUSES[p.status] || STATUSES.not_started;
    return h('span', { className: cx('ek-chip', 'ek-chip--' + s[2], p.className) }, isAr(p.lang) ? s[1] : s[0]);
  }

  /* ---------- LessonCard (lessons and courses) ---------- */
  function LessonCard(p) {
    var T = tr(p.lang), N = nr(p.lang);
    var done = p.done || 0, total = p.total || 0, finished = !!total && done >= total;
    var started = done > 0 && !finished, lessons = p.unit === 'lessons';
    var label = p.actionLabel || (finished ? T('Play again', 'العب مرة أخرى') : started ? T('Keep going', 'تابع') : T('Start', 'ابدأ'));
    var meta = p.meta || (total ? (lessons ? T(N(done) + ' of ' + N(total) + ' lessons done', 'أنهيت ' + N(done) + ' من ' + N(total) + ' دروس') : T(N(done) + ' of ' + N(total) + ' questions done', 'أنهيت ' + N(done) + ' من ' + N(total) + ' أسئلة')) : '');
    return h('article', { className: cx('ek-lesson', p.className), style: p.band ? { '--ek-band': 'var(--' + p.band + ')' } : undefined },
      h('div', { className: 'ek-lesson__band' },
        p.subject && h(Sticker, { color: p.subjectColor || 'blue' }, p.subject),
        finished && p.stars != null && h(StarRating, { stars: p.stars, lang: p.lang, className: 'ek-lesson__stars' })),
      h('div', { className: 'ek-lesson__body' },
        h('h3', { className: 'ek-lesson__title' }, p.title),
        meta && h('p', { className: 'ek-lesson__meta' }, meta),
        total ? h('div', { className: 'ek-meter', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': done, 'aria-label': T('Progress', 'التقدّم') },
          h('i', { style: { width: Math.round(100 * done / total) + '%' } })) : null,
        h(Button, { variant: finished ? 'ghost' : started ? 'leaf' : 'blue', onClick: p.onAction, iconEnd: finished ? null : 'arrowRight' }, label)));
  }

  /* ---------- StateMessage: loading, empty, error ---------- */
  function StateMessage(p) {
    var T = tr(p.lang), kind = p.kind || 'empty';
    var title = p.title || (kind === 'loading' ? T('Loading…', 'جارٍ التحميل…') : kind === 'error' ? T('Oops! Something went wrong.', 'عذرًا! حدث خطأ ما.') : T('Nothing here yet', 'لا شيء هنا بعد'));
    return h('div', { className: cx('ek-state', 'ek-state--' + kind, p.className), role: kind === 'error' ? 'alert' : 'status' },
      kind === 'loading' ? h('span', { className: 'ek-dots', 'aria-hidden': true }, h('i'), h('i'), h('i'))
        : h('span', { className: 'ek-state__icon' }, h(Icon, { name: p.icon || (kind === 'error' ? 'retry' : 'star'), size: 36 })),
      h('strong', { className: 'ek-state__title' }, title),
      p.message && h('p', { className: 'ek-state__msg' }, p.message),
      kind === 'error' && p.onRetry && h(Button, { variant: 'coral', icon: 'retry', onClick: p.onRetry }, T('Try again', 'حاول مرة أخرى')),
      p.action);
  }

  /* ---------- TaskCard: homework, quizzes, plan items ---------- */
  var KIND = { assignment: ['clipboard', 'blue'], quiz: ['pencil', 'bubblegum'], plan: ['calendar', 'leaf'], review: ['retry', 'sun'], lesson: ['play', 'blue'], tutor: ['message', 'sun'] };
  function TaskCard(p) {
    var k = KIND[p.kind] || KIND.assignment;
    return h('article', { className: cx('ek-task', p.highlight && 'is-highlight', p.className) },
      h('span', { className: 'ek-task__icon ek-task__icon--' + k[1] }, h(Icon, { name: p.icon || k[0] })),
      h('div', { className: 'ek-task__body' },
        h('div', { className: 'ek-task__top' }, p.status && h(StatusChip, { status: p.status, lang: p.lang }), p.tag),
        h('h3', { className: 'ek-task__title' }, p.title),
        p.meta && h('p', { className: 'ek-task__meta' }, p.meta),
        p.note && h('p', { className: 'ek-task__note' }, p.note),
        p.children),
      p.action && h('div', { className: 'ek-task__action' }, p.action));
  }

  /* ---------- TimerBar: time left, without alarms ---------- */
  function TimerBar(p) {
    var T = tr(p.lang), N = nr(p.lang), left = Math.max(0, p.secondsLeft || 0), total = p.total || left || 1;
    var mins = Math.ceil(left / 60), low = left <= 120;
    var text = left === 0 ? T('Time is up', 'انتهى الوقت') : left < 60 ? T('Less than a minute left', 'أقل من دقيقة') : T(N(mins) + (mins === 1 ? ' minute left' : ' minutes left'), 'باقي ' + N(mins) + (mins <= 10 && mins > 2 ? ' دقائق' : ' دقيقة'));
    return h('div', { className: cx('ek-timer', low && 'is-low', p.className), role: 'timer', 'aria-live': low ? 'polite' : 'off' },
      h(Icon, { name: 'hourglass' }),
      h('span', { className: 'ek-timer__text' }, text),
      h('span', { className: 'ek-timer__track', 'aria-hidden': true }, h('i', { style: { width: Math.round(100 * left / total) + '%' } })));
  }

  /* ---------- Sheet: a panel over the screen ---------- */
  function Sheet(p) {
    var T = tr(p.lang);
    if (p.open === false) return null;
    return h('div', { className: cx('ek-sheet', p.inline && 'ek-sheet--inline') },
      h('div', { className: 'ek-sheet__scrim', onClick: p.onClose }),
      h('section', { className: cx('ek-sheet__panel', p.className), role: 'dialog', 'aria-modal': 'true', 'aria-label': p.title, dir: dirOf(p.lang) },
        h('header', { className: 'ek-sheet__head' },
          h('h2', { className: 'ek-sheet__title' }, p.title),
          p.onClose && h(Button, { variant: 'ghost', icon: 'close', label: T('Close', 'إغلاق'), onClick: p.onClose })),
        p.children,
        p.actions && h('footer', { className: 'ek-sheet__actions' }, p.actions)));
  }

  /* ---------- WeekDots: activity for the last 7 days ---------- */
  function WeekDots(p) {
    var N = nr(p.lang), days = p.days || [];
    return h('ol', { className: 'ek-week', 'aria-label': p.label },
      days.map(function (d, i) {
        return h('li', { key: i, className: cx('ek-week__day', d.count > 0 && 'is-on', d.today && 'is-today') },
          h('span', { className: 'ek-week__dot' }, d.count > 0 ? N(d.count) : ''),
          h('span', { className: 'ek-week__label' }, d.label));
      }));
  }

  /* ---------- ChatComposer ---------- */
  function ChatComposer(p) {
    var T = tr(p.lang);
    return h('form', { className: 'ek-composer', onSubmit: function (e) { e.preventDefault(); if (p.onSend) p.onSend(); } },
      h('textarea', { className: 'ek-composer__input', rows: 1, value: p.value, onChange: p.onChange, placeholder: p.placeholder || T('Type or talk to Enara…', 'اكتب أو تحدّث مع إنارة…'), 'aria-label': T('Message', 'رسالة') }),
      p.onMic && h(Button, { variant: p.listening ? 'coral' : 'sun', icon: p.listening ? 'stop' : 'mic', label: p.listening ? T('Stop listening', 'أوقف الاستماع') : T('Talk', 'تحدّث'), onClick: p.onMic }),
      h(Button, { icon: 'send', label: T('Send', 'إرسال'), type: 'submit', disabled: !p.value }));
  }

  /* ---------- TourCard: the product tour's spotlight card ---------- */
  function TourCard(p) {
    var T = tr(p.lang), N = nr(p.lang), last = p.step >= p.total;
    return h('section', { className: 'ek-tour', role: 'dialog', 'aria-label': p.title, dir: dirOf(p.lang) },
      h('div', { className: 'ek-tour__top' }, h(Mark, { className: 'ek-tour__mark' }), h('span', { className: 'ek-tour__count' }, T(N(p.step) + ' of ' + N(p.total), N(p.step) + ' من ' + N(p.total)))),
      h('h2', { className: 'ek-tour__title' }, p.title),
      h('p', { className: 'ek-tour__body' }, p.body),
      h('div', { className: 'ek-tour__actions' },
        !last && h(Button, { variant: 'ghost', size: 'sm', onClick: p.onSkip }, T('Skip', 'تخطَّ')),
        p.step > 1 && h(Button, { variant: 'ghost', size: 'sm', icon: 'arrowLeft', label: T('Back', 'رجوع'), onClick: p.onBack }),
        h(Button, { size: 'sm', iconEnd: last ? null : 'arrowRight', onClick: p.onNext }, last ? T('Let’s go!', 'هيا بنا!') : T('Next', 'التالي'))));
  }

  /* =================== Screens =================== */
  function Screen(p, cls, children) {
    return h('section', { className: cx('ek-screen', cls, p.className), dir: dirOf(p.lang), lang: p.lang, 'aria-label': p.ariaLabel }, children);
  }
  function SectionHead(title, extra) { return h('div', { className: 'ek-section-head' }, h('h2', { className: 'ek-section-title' }, title), extra); }

  /* ---------- AppShell: the student tabs ---------- */
  var TABS = {
    home: ['home', 'Home', 'الرئيسية'], learning: ['book', 'My learning', 'دروسي'], progress: ['sprout', 'My skills', 'مهاراتي'],
    assignments: ['clipboard', 'Homework', 'واجباتي'], plan: ['calendar', 'My plan', 'خطتي'], quizzes: ['pencil', 'Quizzes', 'اختباراتي'],
    results: ['trophy', 'My results', 'نتائجي']
  };
  function AppShell(p) {
    var T = tr(p.lang), tabs = p.tabs || ['home', 'learning', 'progress', 'assignments', 'plan', 'results'];
    return h('div', { className: cx('ek-app', p.phone && 'ek-app--phone', p.className), dir: dirOf(p.lang), lang: p.lang },
      h('nav', { className: 'ek-rail', 'aria-label': T('Main', 'القائمة') },
        h(Mark, { className: 'ek-rail__logo', alt: 'Enara' }),
        tabs.map(function (k) {
          var t = TABS[k];
          return h('button', { key: k, type: 'button', className: 'ek-tab', 'aria-current': p.current === k ? 'page' : undefined, onClick: p.onNavigate ? function () { p.onNavigate(k); } : undefined },
            h('span', { className: 'ek-tab__icon' }, h(Icon, { name: t[0] })), isAr(p.lang) ? t[2] : t[1]);
        }),
        h('span', { className: 'ek-rail__spacer' }),
        p.onLang && h('button', { type: 'button', className: 'ek-tab ek-tab--quiet', onClick: p.onLang, 'aria-label': T('Change language', 'غيّر اللغة') }, h('span', { className: 'ek-tab__icon ek-tab__lang' }, isEg(p.lang) ? 'مصري' : isAr(p.lang) ? 'ع' : 'EN'), isEg(p.lang) ? 'مصري' : isAr(p.lang) ? 'العربية' : 'English'),
        p.onTour !== false && h('button', { type: 'button', className: 'ek-tab ek-tab--quiet', onClick: p.onTour }, h('span', { className: 'ek-tab__icon' }, h(Icon, { name: 'compass' })), T('Tour', 'جولة')),
        h('button', { type: 'button', className: 'ek-tab ek-tab--quiet', onClick: p.onSignOut }, h('span', { className: 'ek-tab__icon' }, h(Icon, { name: 'logout' })), T('Sign out', 'خروج'))),
      h('main', { className: 'ek-app__main' }, p.children,
        p.onTutor !== false && h(Button, { variant: 'sun', size: 'lg', icon: 'message', className: 'ek-app__tutor', onClick: p.onTutor }, T('Ask Enara', 'اسأل إنارة')),
        p.overlay));
  }

  /* ---------- SignInScreen ---------- */
  function SignInScreen(p) {
    var T = tr(p.lang);
    var e = useState(p.email || ''), email = e[0], setEmail = e[1];
    var w = useState(''), pw = w[0], setPw = w[1];
    var s = useState(false), show = s[0], setShow = s[1];
    var er = useState(p.error || null), err = er[0], setErr = er[1];
    var f = useState(false), forgot = f[0], setForgot = f[1];
    function submit(ev) {
      ev.preventDefault();
      if (!/.+@.+\..+/.test(email)) return setErr(T('Type your email, like name@school.edu.', 'اكتب بريدك، مثل name@school.edu.'));
      if (!pw) return setErr(T('Type your password.', 'اكتب كلمة المرور.'));
      setErr(null); if (p.onSubmit) p.onSubmit(email, pw);
    }
    return Screen(p, 'ek-screen--signin', [
      h('svg', { key: 'art', className: 'ek-signin__art', viewBox: '0 0 400 400', 'aria-hidden': true },
        h('rect', { className: 'f-blue', x: 40, y: -40, width: 150, height: 300, rx: 75 }),
        h('circle', { className: 'f-paper', cx: 115, cy: 40, r: 9 }), h('circle', { className: 'f-paper', cx: 115, cy: 76, r: 9 }), h('circle', { className: 'f-paper', cx: 115, cy: 112, r: 9 }), h('circle', { className: 'f-paper', cx: 115, cy: 148, r: 9 }),
        h('circle', { className: 'f-sun', cx: 290, cy: 120, r: 84 }),
        h('rect', { className: 'f-leaf', x: 160, y: 250, width: 230, height: 96, rx: 48 }),
        h('circle', { className: 'f-coral', cx: 90, cy: 320, r: 46 })),
      h('form', { key: 'card', className: 'ek-signin', onSubmit: submit, noValidate: true },
        h('div', { className: 'ek-signin__top' },
          h(Mark, { alt: 'Enara' }),
          h('div', { className: 'ek-segment', role: 'group', 'aria-label': T('Language', 'اللغة') },
            h('button', { type: 'button', 'aria-pressed': !isAr(p.lang), onClick: function () { if (p.onLang) p.onLang('en'); } }, 'EN'),
            h('button', { type: 'button', 'aria-pressed': isAr(p.lang), lang: 'ar', onClick: function () { if (p.onLang) p.onLang('ar'); } }, 'ع'))),
        h('h1', { className: 'ek-signin__title' }, T('Welcome back!', 'أهلًا بعودتك!')),
        h('p', { className: 'ek-signin__sub' }, p.shared ? T('Sign in to open what your teacher shared.', 'سجّل الدخول لتفتح ما شاركه معلّمك.') : T('Sign in to start learning.', 'سجّل الدخول لتبدأ التعلّم.')),
        h(AnswerInput, { label: T('Email', 'البريد الإلكتروني'), type: 'email', dir: 'ltr', value: email, placeholder: 'name@school.edu', onChange: function (ev) { setEmail(ev.target.value); }, className: 'ek-field--plain' }),
        h(AnswerInput, { label: T('Password', 'كلمة المرور'), type: show ? 'text' : 'password', value: pw, placeholder: T('Your password', 'كلمة المرور'), onChange: function (ev) { setPw(ev.target.value); }, className: 'ek-field--plain',
          trailing: h(Button, { variant: 'ghost', icon: show ? 'eyeOff' : 'eye', label: show ? T('Hide password', 'إخفاء كلمة المرور') : T('Show password', 'إظهار كلمة المرور'), onClick: function () { setShow(!show); } }) }),
        err && h('p', { className: 'ek-alert', role: 'alert' }, h(Icon, { name: 'retry' }), err),
        forgot && h('p', { className: 'ek-alert ek-alert--info', role: 'status' }, h(Icon, { name: 'mail' }), T('If that email has an account, we sent it a link. Ask a grown-up to help you open it.', 'إذا كان لهذا البريد حساب، أرسلنا إليه رابطًا. اطلب من شخص كبير أن يساعدك في فتحه.')),
        h(Button, { size: 'lg', type: 'submit', iconEnd: p.busy ? null : 'arrowRight', disabled: p.busy, className: 'ek-signin__go' }, p.busy ? T('Signing in…', 'جارٍ الدخول…') : T('Let’s go!', 'هيا بنا!')),
        h('button', { type: 'button', className: 'ek-link', onClick: function () { setForgot(true); } }, T('Forgot your password?', 'نسيت كلمة المرور؟')),
        h('p', { className: 'ek-signin__foot' }, T('Your school gives you your account.', 'مدرستك تعطيك حسابك.')))
    ]);
  }

  /* ---------- SetPasswordScreen (invite and reset links) ---------- */
  function SetPasswordScreen(p) {
    var T = tr(p.lang), invite = p.mode === 'invite';
    var a = useState(''), pw = a[0], setPw = a[1];
    var b = useState(''), pw2 = b[0], setPw2 = b[1];
    var c = useState(''), name = c[0], setName = c[1];
    var d = useState(!!p.done), done = d[0], setDone = d[1];
    var e = useState(null), err = e[0], setErr = e[1];
    function submit(ev) {
      ev.preventDefault();
      if (pw.length < 8) return setErr(T('Use at least 8 letters or numbers.', 'استخدم ٨ حروف أو أرقام على الأقل.'));
      if (pw !== pw2) return setErr(T('The two passwords are not the same.', 'كلمتا المرور غير متطابقتين.'));
      setErr(null); setDone(true); if (p.onSubmit) p.onSubmit({ name: name, password: pw });
    }
    return Screen(p, 'ek-screen--center', h('form', { className: 'ek-card ek-card--narrow', onSubmit: submit, noValidate: true },
      done ? [
        h('span', { key: 'i', className: 'ek-bigicon ek-bigicon--leaf' }, h(Icon, { name: 'check', size: 44 })),
        h('h1', { key: 't', className: 'ek-card__title' }, invite ? T('Your account is ready!', 'حسابك جاهز!') : T('Your password is changed!', 'تم تغيير كلمة المرور!')),
        h('p', { key: 'm', className: 'ek-card__text' }, T('You can sign in now.', 'يمكنك تسجيل الدخول الآن.')),
        h(Button, { key: 'b', size: 'lg', iconEnd: 'arrowRight', onClick: p.onSignIn }, T('Go to sign in', 'إلى تسجيل الدخول'))
      ] : [
        h(Mark, { key: 'mk', alt: 'Enara' }),
        h('h1', { key: 't', className: 'ek-card__title' }, invite ? T('Join your school on Enara', 'انضمّ إلى مدرستك على إنارة') : T('Choose a new password', 'اختر كلمة مرور جديدة')),
        invite && h(AnswerInput, { key: 'n', label: T('Your name', 'اسمك'), value: name, onChange: function (ev) { setName(ev.target.value); }, className: 'ek-field--plain' }),
        h(AnswerInput, { key: 'p1', label: T('New password', 'كلمة مرور جديدة'), type: 'password', value: pw, hint: T('At least 8 letters or numbers.', '٨ حروف أو أرقام على الأقل.'), onChange: function (ev) { setPw(ev.target.value); }, className: 'ek-field--plain' }),
        h(AnswerInput, { key: 'p2', label: T('Type it again', 'اكتبها مرة أخرى'), type: 'password', value: pw2, onChange: function (ev) { setPw2(ev.target.value); }, className: 'ek-field--plain' }),
        err && h('p', { key: 'e', className: 'ek-alert', role: 'alert' }, h(Icon, { name: 'retry' }), err),
        h(Button, { key: 'b', size: 'lg', type: 'submit' }, invite ? T('Create my account', 'أنشئ حسابي') : T('Save new password', 'احفظ كلمة المرور')),
        h('button', { key: 'k', type: 'button', className: 'ek-link', onClick: p.onSignIn }, T('Back to sign in', 'العودة لتسجيل الدخول'))
      ]));
  }

  /* ---------- HomeScreen ---------- */
  var HOME_EN = {
    name: 'Layla',
    resume: { subject: 'Maths', band: 'sun', course: 'Numbers to 100', lesson: 'Counting in tens', n: 3, of: 8 },
    due: [
      { id: 'd1', kind: 'quiz', title: 'Fractions quiz', subject: 'Maths', questions: 8, minutes: 15, due: '2026-11-18', open: true },
      { id: 'd2', kind: 'assignment', title: 'My favourite animal', subject: 'English', due: '2026-11-20', open: true },
      { id: 'd3', kind: 'quiz', title: 'Plants check', subject: 'Science', opens: '2026-11-24', open: false }
    ],
    steps: [
      { id: 's1', kind: 'review', title: 'Quick review: 5 questions', detail: 'Questions you found tricky last week.' },
      { id: 's2', kind: 'tutor', title: 'Practise halves with Enara', detail: 'You are close to a star skill.' },
      { id: 's3', kind: 'lesson', title: 'Next lesson: Counting in tens', detail: 'Numbers to 100 · 10 minutes' }
    ],
    courses: [
      { id: 'c1', subject: 'Maths', band: 'sun', title: 'Numbers to 100', done: 2, total: 8 },
      { id: 'c2', subject: 'English', band: 'bubblegum', subjectColor: 'sun', title: 'Reading stories', done: 0, total: 6 },
      { id: 'c3', subject: 'Science', band: 'leaf', subjectColor: 'sun', title: 'Living things', done: 5, total: 5 }
    ],
    results: [{ id: 'r1', title: 'Shapes quiz', date: '2026-11-12', score: 90 }, { id: 'r2', title: 'Spelling test', date: '2026-11-10', score: 65 }, { id: 'r3', title: 'Story writing', date: '2026-11-09', score: null }],
    week: [0, 2, 1, 0, 3, 1, 2],
    badges: [{ label: 'First quiz', color: 'sun', icon: 'star' }, { label: 'Story finisher', color: 'bubblegum' }, { label: 'Tutor friend', color: 'leaf', icon: 'message' }, { label: '10 lessons', locked: true }]
  };
  var HOME_AR = {
    name: 'ليلى',
    resume: { subject: 'رياضيات', band: 'sun', course: 'الأعداد حتى ١٠٠', lesson: 'العدّ بالعشرات', n: 3, of: 8 },
    due: [
      { id: 'd1', kind: 'quiz', title: 'اختبار الكسور', subject: 'رياضيات', questions: 8, minutes: 15, due: '2026-11-18', open: true },
      { id: 'd2', kind: 'assignment', title: 'حيواني المفضّل', subject: 'لغة عربية', due: '2026-11-20', open: true },
      { id: 'd3', kind: 'quiz', title: 'اختبار النباتات', subject: 'علوم', opens: '2026-11-24', open: false }
    ],
    steps: [
      { id: 's1', kind: 'review', title: 'مراجعة سريعة: ٥ أسئلة', detail: 'أسئلة وجدتها صعبة الأسبوع الماضي.' },
      { id: 's2', kind: 'tutor', title: 'تدرّب على الأنصاف مع إنارة', detail: 'أنت قريب من مهارة نجمة.' },
      { id: 's3', kind: 'lesson', title: 'الدرس التالي: العدّ بالعشرات', detail: 'الأعداد حتى ١٠٠، ١٠ دقائق' }
    ],
    courses: [
      { id: 'c1', subject: 'رياضيات', band: 'sun', title: 'الأعداد حتى ١٠٠', done: 2, total: 8 },
      { id: 'c2', subject: 'لغة عربية', band: 'bubblegum', subjectColor: 'sun', title: 'قراءة القصص', done: 0, total: 6 },
      { id: 'c3', subject: 'علوم', band: 'leaf', subjectColor: 'sun', title: 'الكائنات الحية', done: 5, total: 5 }
    ],
    results: [{ id: 'r1', title: 'اختبار الأشكال', date: '2026-11-12', score: 90 }, { id: 'r2', title: 'اختبار الإملاء', date: '2026-11-10', score: 65 }, { id: 'r3', title: 'كتابة قصة', date: '2026-11-09', score: null }],
    week: [0, 2, 1, 0, 3, 1, 2],
    badges: [{ label: 'أول اختبار', color: 'sun', icon: 'star' }, { label: 'قارئ القصص', color: 'bubblegum' }, { label: 'صديق إنارة', color: 'leaf', icon: 'message' }, { label: '١٠ دروس', locked: true }]
  };
  var DAYS = { en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'], ar: ['ن', 'ث', 'ر', 'خ', 'ج', 'س', 'ح'] };
  function HomeScreen(p) {
    var T = tr(p.lang), N = nr(p.lang), d = Object.assign({}, isAr(p.lang) ? HOME_AR : HOME_EN, p.data || {});
    if (p.state === 'loading' || p.state === 'error') return Screen(p, 'ek-screen--home', h(StateMessage, { kind: p.state, lang: p.lang, onRetry: p.onRetry, title: p.state === 'error' ? T('We couldn’t load your home page.', 'تعذّر تحميل صفحتك الرئيسية.') : null }));
    var r = d.resume;
    var stepBtn = { review: T('Start review', 'ابدأ المراجعة'), tutor: T('Practise with Enara', 'تدرّب مع إنارة'), lesson: T('Open lesson', 'افتح الدرس') };
    return Screen(p, 'ek-screen--home', [
      h('header', { key: 'top', className: 'ek-home__top' },
        h('div', { className: 'ek-home__hello' },
          h('h1', { className: 'ek-home__title' }, T('Hi, ' + d.name + '!', 'مرحبًا يا ' + d.name + '!')),
          h('p', { className: 'ek-home__sub' }, cheer('welcome', p.lang, p.seed != null ? p.seed : new Date().toDateString())))),
      h('div', { key: 'grid', className: 'ek-home__grid' },
        h('div', { className: 'ek-home__main' },
          r ? h('article', { className: 'ek-resume', style: { '--ek-band': 'var(--' + (r.band || 'sun') + ')' } },
            h('div', { className: 'ek-resume__band' }, h(Sticker, { color: 'blue' }, r.subject)),
            h('div', { className: 'ek-resume__body' },
              h('p', { className: 'ek-resume__course' }, r.course + sep(p.lang) + T('Lesson ' + N(r.n) + ' of ' + N(r.of), 'الدرس ' + N(r.n) + ' من ' + N(r.of))),
              h('h2', { className: 'ek-resume__title' }, r.lesson),
              h(ProgressTrail, { total: r.of, current: r.n - 1, label: false, rewardLast: true, lang: p.lang }),
              h(Button, { size: 'lg', variant: 'leaf', iconEnd: 'arrowRight', onClick: p.onResume }, T('Keep going', 'تابع'))))
            : h(StateMessage, { lang: p.lang, icon: 'book', title: T('You don’t have any lessons yet', 'ليس لديك دروس بعد'), message: T('When your school adds you to a course, it will show up here.', 'عندما تضيفك مدرستك إلى مادة، ستظهر هنا.') }),
          d.steps && d.steps.length ? h('section', { className: 'ek-block' }, SectionHead(T('Your next steps', 'خطواتك التالية')),
            h('div', { className: 'ek-steps' }, d.steps.map(function (s, i) {
              return h(TaskCard, { key: s.id, kind: s.kind, title: s.title, meta: s.detail, highlight: i === 0, lang: p.lang,
                action: h(Button, { variant: s.kind === 'review' ? 'sun' : s.kind === 'tutor' ? 'ghost' : 'blue', size: 'sm', onClick: p.onStep ? function () { p.onStep(s); } : undefined }, stepBtn[s.kind]) });
            }))) : null,
          h('section', { className: 'ek-block' }, SectionHead(T('My courses', 'موادي'), h('button', { type: 'button', className: 'ek-link', onClick: p.onAllCourses }, T('See all', 'عرض الكل'))),
            h('div', { className: 'ek-cards' }, d.courses.map(function (c) { return h(LessonCard, Object.assign({ key: c.id, unit: 'lessons', lang: p.lang, stars: null }, c)); }),
              h('button', { type: 'button', className: 'ek-askcard', onClick: p.onTutor }, h(Mark, null), h('strong', null, T('Stuck? Ask Enara', 'محتار؟ اسأل إنارة')), h('span', null, T('Get a hint about your lessons.', 'احصل على تلميح عن دروسك.')))))),
        h('aside', { className: 'ek-home__side' },
          h('section', { className: 'ek-panel' }, SectionHead(T('Due soon', 'قريبًا')),
            d.due.length ? d.due.slice(0, 3).map(function (x) {
              var meta = [x.subject, x.questions && T(N(x.questions) + ' questions', N(x.questions) + ' أسئلة'), x.minutes && T(N(x.minutes) + ' min', N(x.minutes) + ' دقيقة')].filter(Boolean).join(sep(p.lang));
              return h(TaskCard, { key: x.id, kind: x.kind, title: x.title, meta: meta, lang: p.lang, highlight: x.open,
                note: x.open ? (x.due ? T('Due ', 'موعده ') + dateLabel(x.due, p.lang) : null) : (x.opens ? T('Opens ', 'يُفتح ') + dateLabel(x.opens, p.lang) : T('Not open yet', 'لم يُفتح بعد')),
                action: x.open ? h(Button, { size: 'sm', iconEnd: 'arrowRight', onClick: p.onOpenDue ? function () { p.onOpenDue(x); } : undefined }, x.kind === 'quiz' ? T('Start', 'ابدأ') : T('Open', 'افتح')) : h(Icon, { name: 'lock' }) });
            }) : h('p', { className: 'ek-muted' }, T('Nothing due right now. Nice work!', 'لا شيء مطلوب الآن. أحسنت!'))),
          h('section', { className: 'ek-panel' }, SectionHead(T('Your week', 'أسبوعك')),
            h(WeekDots, { lang: p.lang, label: T('Quizzes and tutor chats each day', 'الاختبارات والمحادثات كل يوم'), days: d.week.map(function (c, i) { return { label: (d.weekLabels || DAYS[isAr(p.lang) ? 'ar' : 'en'])[i], count: c, today: i === 6 }; }) }),
            h('p', { className: 'ek-muted' }, T('Quizzes and tutor chats each day', 'الاختبارات والمحادثات مع إنارة كل يوم'))),
          h('section', { className: 'ek-panel' }, SectionHead(T('Recent results', 'آخر النتائج'), h('button', { type: 'button', className: 'ek-link', onClick: p.onAllResults }, T('See all', 'عرض الكل'))),
            d.results.length ? h('ul', { className: 'ek-list' }, d.results.map(function (x) {
              return h('li', { key: x.id, className: 'ek-list__row' }, h('span', null, h('strong', null, x.title), h('small', null, dateLabel(x.date, p.lang, { weekday: undefined }))),
                x.score == null ? h(StatusChip, { status: 'grading', lang: p.lang }) : h(StarRating, { stars: starsFor(x.score), size: 'sm', lang: p.lang }));
            })) : h('p', { className: 'ek-muted' }, T('No results yet. Finished quizzes show up here.', 'لا نتائج بعد. ستظهر الاختبارات المنتهية هنا.'))),
          d.badges && d.badges.length ? h('section', { className: 'ek-panel' }, SectionHead(T('Badges', 'الأوسمة')),
            h('div', { className: 'ek-badges' }, d.badges.map(function (b, i) { return h(Sticker, { key: i, color: b.locked ? 'none' : b.color, icon: b.icon, locked: b.locked }, b.label); }))) : null))
    ]);
  }

  /* ---------- QuickReviewScreen ---------- */
  var REVIEW_EN = [
    { id: 'q1', topic: 'Halves', text: 'What is half of 10?', choices: [{ id: 'a', text: '2' }, { id: 'b', text: '5' }, { id: 'c', text: '20' }], answer: 'b', days: 3, why: 'Half means 2 equal parts. 10 split into 2 equal parts is 5 and 5.' },
    { id: 'q2', topic: 'Shapes', text: 'How many sides does a triangle have?', choices: [{ id: 'a', text: '3' }, { id: 'b', text: '4' }], answer: 'a', mastered: true, why: 'Tri means three.' },
    { id: 'q3', topic: 'Spelling', text: 'Type the word: a baby cat is a …', typed: true, answer: 'kitten', why: 'A baby cat is a kitten.' }
  ];
  function QuickReviewScreen(p) {
    var T = tr(p.lang), N = nr(p.lang), qs = p.questions || REVIEW_EN;
    var a = useState(0), i = a[0], setI = a[1];
    var b = useState(null), pick = b[0], setPick = b[1];
    var c = useState(null), res = c[0], setRes = c[1];
    var d = useState(0), right = d[0], setRight = d[1];
    var e = useState(''), typed = e[0], setTyped = e[1];
    var f = useState(null), info = f[0], setInfo = f[1];
    var q = qs[i];
    function check(v) {
      if (p.onAnswer) {
        // The server checks the answer: { correct, answer, answerText, explanation, days, mastered }.
        Promise.resolve(p.onAnswer(q, v)).then(function (r) {
          r = r || {}; setInfo(r); setRes(r.correct ? 'correct' : 'tryagain'); if (r.correct) setRight(right + 1);
        });
        return;
      }
      var ok = String(v).trim().toLowerCase() === String(q.answer).toLowerCase();
      setRes(ok ? 'correct' : 'tryagain'); if (ok) setRight(right + 1);
    }
    function next() { setI(i + 1); setPick(null); setRes(null); setTyped(''); setInfo(null); }
    if (!qs.length) return Screen(p, 'ek-screen--review', h(StateMessage, { lang: p.lang, icon: 'check', title: T('Nothing to review right now', 'لا شيء للمراجعة الآن'), action: h(Button, { onClick: p.onClose }, T('Close', 'إغلاق')) }));
    if (i >= qs.length) return Screen(p, 'ek-screen--review', h('div', { className: 'ek-reward' },
      h(StarRating, { stars: starsFor(100 * right / qs.length), size: 'lg', lang: p.lang }),
      h('h2', { className: 'ek-reward__title' }, T('Done for today!', 'انتهيت لليوم!')),
      h(Cheer, { moment: right === qs.length ? 'quiz3' : 'checkDone', lang: p.lang, seed: right }),
      h('p', { className: 'ek-reward__message' }, T('You got ' + N(right) + ' of ' + N(qs.length) + ' right. Questions you missed come back tomorrow. The ones you got right come back later.', 'أجبت ' + N(right) + ' من ' + N(qs.length) + ' صحيحة. الأسئلة التي فاتتك تعود غدًا، والصحيحة تعود لاحقًا.')),
      h(Button, { size: 'lg', onClick: p.onClose }, T('Close', 'إغلاق'))));
    var R = Object.assign({ answer: q.answer, explanation: q.why, days: q.days, mastered: q.mastered }, info || {});
    var ansText = R.answerText || (q.typed || !q.choices ? R.answer : ((q.choices.filter(function (c) { return c.id === R.answer; })[0] || {}).text || R.answer));
    var msg = res === 'correct' ? (R.mastered ? T('Right, and you’ve got this one now!', 'صحيح، وقد أتقنته الآن!') : T('Right! It comes back in ' + N(R.days || 3) + ' days.', 'صحيح! سيعود بعد ' + N(R.days || 3) + ' أيام.'))
      : res ? h(Fragment, null, T('Not quite. It comes back tomorrow. ', 'ليس تمامًا. سيعود غدًا. '), ansText != null && ansText !== '' && h('strong', null, T('Answer: ', 'الإجابة: ') + ansText), R.explanation && h('br'), R.explanation) : null;
    return Screen(p, 'ek-screen--review', [
      h('header', { key: 'h', className: 'ek-screen__top' },
        h(Button, { variant: 'ghost', icon: 'close', label: T('Close review', 'إغلاق المراجعة'), onClick: p.onClose }),
        h('div', { className: 'ek-screen__trail' }, h('span', { className: 'ek-kicker' }, T('Quick review', 'مراجعة سريعة') + sep(p.lang) + q.topic),
          h(ProgressTrail, { total: qs.length, current: i, lang: p.lang }))),
      h('h2', { key: 'q', className: 'ek-screen__question' }, q.text),
      q.typed ? h('div', { key: 'in', className: 'ek-row' }, h(AnswerInput, { label: T('Your answer', 'إجابتك'), value: typed, status: res, disabled: !!res, onChange: function (ev) { setTyped(ev.target.value); } }))
        : h(ChoiceGroup, { key: 'c' + q.id, label: q.text, choices: q.choices, value: pick, lang: p.lang, status: res, reveal: R.answer, locked: !!res, onChange: function (v) { if (!res) { setPick(v); check(v); } } }),
      res ? h(FeedbackBar, { key: 'f', status: res, lang: p.lang, seed: q.id, title: res === 'correct' ? null : T('Not quite. That’s OK!', 'ليس تمامًا، ولا بأس!'), message: msg, onContinue: next, onRetry: next, retryVariant: 'blue', retryIcon: null, retryIconEnd: 'arrowRight', retryLabel: i === qs.length - 1 ? T('Finish', 'إنهاء') : T('Next question', 'السؤال التالي'), continueLabel: i === qs.length - 1 ? T('Finish', 'إنهاء') : T('Next question', 'السؤال التالي') })
        : q.typed && h('footer', { key: 'a', className: 'ek-screen__actions' }, h(Button, { variant: 'leaf', size: 'lg', disabled: !typed.trim(), onClick: function () { check(typed); } }, T('Check', 'تحقّق')))
    ]);
  }

  /* ---------- CoursesScreen (My learning) ---------- */
  function CoursesScreen(p) {
    var T = tr(p.lang), courses = p.courses || HOME_EN.courses.concat([{ id: 'c4', subject: 'Art', band: 'coral', subjectColor: 'sun', title: 'Colours and shapes', done: 1, total: 4 }]);
    var body = p.state === 'loading' ? h(StateMessage, { kind: 'loading', lang: p.lang, title: T('Getting your courses…', 'نحضّر موادّك…') })
      : p.state === 'error' ? h(StateMessage, { kind: 'error', lang: p.lang, onRetry: p.onRetry, title: T('We couldn’t load your courses.', 'تعذّر تحميل موادّك.') })
      : !courses.length ? h(StateMessage, { lang: p.lang, icon: 'book', title: T('No courses yet', 'لا مواد بعد'), message: T('Courses your school gives you will show up here.', 'المواد التي تعطيك إياها مدرستك ستظهر هنا.') })
      : h('div', { className: 'ek-cards' }, courses.map(function (c) { return h(LessonCard, Object.assign({ key: c.id, unit: 'lessons', lang: p.lang, onAction: p.onOpen ? function () { p.onOpen(c.id); } : undefined }, c)); }));
    return Screen(p, 'ek-screen--wide', [
      h('header', { key: 'h', className: 'ek-pagehead' }, h('h1', { className: 'ek-pagehead__title' }, T('My learning', 'دروسي')), h('p', { className: 'ek-pagehead__sub' }, T('Pick up where you left off, or start something new.', 'تابع من حيث توقّفت، أو ابدأ شيئًا جديدًا.'))),
      h('div', { key: 'b' }, body)
    ]);
  }

  /* ---------- LessonMap (course outline) ---------- */
  var COURSE_EN = {
    subject: 'Maths', title: 'Numbers to 100',
    modules: [
      { title: 'Counting', lessons: [{ id: 1, title: 'Count to 20', minutes: 8, status: 'completed', stars: 3 }, { id: 2, title: 'Count to 50', minutes: 10, status: 'completed', stars: 2 }, { id: 3, title: 'Counting in tens', minutes: 10, status: 'active' }] },
      { title: 'Comparing', lessons: [{ id: 4, title: 'Bigger or smaller', minutes: 12, status: 'locked' }, { id: 5, title: 'Unit quiz', minutes: 15, status: 'locked', reward: true }] }
    ],
    resources: ['Number chart.pdf', 'Counting song.mp3']
  };
  function LessonMap(p) {
    var T = tr(p.lang), N = nr(p.lang), c = Object.assign({}, COURSE_EN, p.course || {});
    if (p.lessons) c.modules = [{ title: '', lessons: p.lessons.map(function (l) { return Object.assign({ status: l.state === 'done' ? 'completed' : l.state === 'current' ? 'active' : l.state }, l); }) }];
    var all = [].concat.apply([], c.modules.map(function (m) { return m.lessons; }));
    var doneN = all.filter(function (l) { return l.status === 'completed'; }).length, cur = all.filter(function (l) { return l.status === 'active'; })[0];
    return Screen(p, 'ek-screen--map', [
      h('header', { key: 'h', className: 'ek-map__head' },
        p.onBack !== false && h(Button, { variant: 'ghost', icon: 'arrowLeft', label: T('Back to my learning', 'العودة إلى دروسي'), onClick: p.onBack }),
        h('div', null, h(Sticker, { color: p.subjectColor || 'blue' }, p.subject || c.subject), h('h1', { className: 'ek-map__title' }, p.title || c.title),
          h('p', { className: 'ek-muted' }, T(N(doneN) + ' of ' + N(all.length) + ' lessons done', 'أنهيت ' + N(doneN) + ' من ' + N(all.length) + ' دروس')))),
      cur && h('div', { key: 'go', className: 'ek-map__go' }, h(Button, { size: 'lg', variant: doneN ? 'leaf' : 'blue', iconEnd: 'arrowRight', onClick: p.onOpen ? function () { p.onOpen(cur.id); } : undefined }, (doneN ? T('Continue: ', 'تابع: ') : T('Start: ', 'ابدأ: ')) + cur.title)),
      c.modules.map(function (m, mi) {
        return h('section', { key: 'm' + mi, className: 'ek-module' }, m.title && h('h2', { className: 'ek-section-title' }, N(mi + 1) + '. ' + m.title),
          h('ol', { className: 'ek-map' }, m.lessons.map(function (l) {
            var locked = l.status === 'locked', isCur = l.status === 'active', done = l.status === 'completed';
            return h('li', { key: l.id, className: cx('ek-map__item', 'is-' + (done ? 'done' : isCur ? 'current' : 'locked')) },
              h('button', { type: 'button', className: 'ek-map__node', disabled: locked, 'aria-current': isCur ? 'step' : undefined,
                'aria-label': l.title + (done ? T(', done', '، انتهى') : isCur ? T(', start here', '، ابدأ هنا') : T(', locked', '، مقفل')),
                onClick: p.onOpen ? function () { p.onOpen(l.id); } : undefined },
                h(Icon, { name: done ? 'check' : isCur ? 'play' : l.reward ? 'star' : 'lock', filled: isCur, size: isCur ? 36 : 30 })),
              h('div', { className: 'ek-map__label' },
                h('span', { className: 'ek-map__name' }, l.title),
                done ? h(StarRating, { stars: l.stars || 0, size: 'sm', lang: p.lang }) : isCur ? h('span', { className: 'ek-map__now' }, T('Start here', 'ابدأ هنا')) : l.minutes ? h('span', { className: 'ek-muted' }, T(N(l.minutes) + ' minutes', N(l.minutes) + ' دقائق')) : null));
          })));
      }),
      c.resources && c.resources.length ? h('section', { key: 'r', className: 'ek-block' }, SectionHead(T('Things to download', 'ملفات للتحميل')),
        h('div', { className: 'ek-files' }, c.resources.map(function (f, i) { var name = f.name || f, url = f.url; return url ? h('a', { key: i, className: 'ek-file', href: url, target: '_blank', rel: 'noreferrer' }, h(Icon, { name: 'download' }), name) : h('button', { key: i, type: 'button', className: 'ek-file' }, h(Icon, { name: 'download' }), name); }))) : null
    ]);
  }

  /* ---------- LessonScreen ---------- */
  var LESSON_EN = {
    n: 3, minutes: 10, module: 'Counting', title: 'Counting in tens',
    tip: 'When we count in tens, we jump 10 each time: 10, 20, 30…',
    text: ['Ten ones make one ten. Bundle 10 sticks together and you have one ten!', 'Count the bundles: 1 ten is 10, 2 tens is 20, 3 tens is 30.'],
    quiz: [
      { id: 'k1', text: 'What comes after 30 when counting in tens?', choices: [{ id: 'a', text: '31' }, { id: 'b', text: '40' }, { id: 'c', text: '300' }], answer: 'b', why: 'Add one more ten: 30 + 10 = 40.' },
      { id: 'k2', text: 'How many tens are in 50?', choices: [{ id: 'a', text: '5' }, { id: 'b', text: '50' }], answer: 'a', why: '10, 20, 30, 40, 50: that is 5 tens.' }
    ],
    files: ['Tens worksheet.pdf']
  };
  function LessonScreen(p) {
    var T = tr(p.lang), N = nr(p.lang), L = Object.assign({}, LESSON_EN, p.lesson || {}); L.quiz = L.quiz || []; L.text = L.text || []; L.files = L.files || [];
    var a = useState({}), picks = a[0], setPicks = a[1];
    var b = useState(!!p.checked), checked = b[0], setChecked = b[1];
    var c = useState(!!p.completed), complete = c[0], setComplete = c[1];
    if (p.preset && !Object.keys(picks).length) { picks = p.preset; }
    var all = L.quiz.every(function (q) { return picks[q.id]; });
    var right = L.quiz.filter(function (q) { return picks[q.id] === q.answer; }).length;
    return Screen(p, 'ek-screen--lesson', [
      h('header', { key: 'h', className: 'ek-lessonhead' },
        h(Button, { variant: 'ghost', icon: 'arrowLeft', label: T('Back to the course', 'العودة إلى المادة'), onClick: p.onBack }),
        h('div', null, h('span', { className: 'ek-kicker' }, [T('Lesson ' + N(L.n), 'الدرس ' + N(L.n)), L.minutes ? T(N(L.minutes) + ' minutes', N(L.minutes) + ' دقائق') : null, L.module || null].filter(Boolean).join(sep(p.lang))), h('h1', { className: 'ek-pagehead__title' }, L.title))),
      p.video !== undefined ? (p.video && h('div', { key: 'v', className: 'ek-video ek-video--live' }, p.video))
        : h('div', { key: 'v', className: 'ek-video' }, h('span', { className: 'ek-video__play' }, h(Icon, { name: 'play', filled: true, size: 40 })), h('span', { className: 'ek-video__label' }, T('Watch the video', 'شاهد الفيديو'))),
      p.onAskTutor !== false && h('div', { key: 'va', className: 'ek-row' }, h(Button, { variant: 'sun', icon: 'message', onClick: p.onAskTutor }, p.video === undefined || p.video ? T('Ask Enara about this video', 'اسأل إنارة عن الفيديو') : T('Ask Enara about this lesson', 'اسأل إنارة عن هذا الدرس'))),
      L.tip && h(TutorBubble, { key: 'tip', lang: p.lang, name: T('Remember', 'تذكّر'), onReadAloud: p.onReadAloud ? function () { p.onReadAloud(L.tip); } : function () {} }, L.tip),
      h('div', { key: 't', className: 'ek-prose' }, L.text.map(function (t, i) { return h('p', { key: i }, t); })),
      L.quiz.length ? h('section', { key: 'q', className: 'ek-block ek-check' }, SectionHead(T('Check what you learned', 'تحقّق ممّا تعلّمت')),
        L.quiz.map(function (q, qi) {
          var st = checked ? (picks[q.id] === q.answer ? 'correct' : 'tryagain') : null;
          return h('div', { key: q.id, className: 'ek-check__q' },
            h('h3', { className: 'ek-check__text' }, N(qi + 1) + '. ' + q.text),
            h(ChoiceGroup, { label: q.text, choices: q.choices, value: picks[q.id] || null, lang: p.lang, status: st, reveal: q.answer, locked: checked, columns: 2, onChange: function (v) { var o = Object.assign({}, picks); o[q.id] = v; setPicks(o); } }),
            checked && h('p', { className: 'ek-why' }, h(Icon, { name: 'hint' }), q.why));
        }),
        checked ? h('div', { className: cx('ek-feedback', right === L.quiz.length ? 'is-correct' : 'is-tryagain') },
          h('span', { className: 'ek-feedback__badge' }, h(Icon, { name: right === L.quiz.length ? 'check' : 'star' })),
          h('div', { className: 'ek-feedback__text' }, h('strong', null, T('You got ' + N(right) + ' of ' + N(L.quiz.length) + ' right!', 'أجبت ' + N(right) + ' من ' + N(L.quiz.length) + ' صحيحة!')), h('span', null, cheer(right === L.quiz.length ? 'correct' : 'tryAgain', p.lang, L.title) + ' ' + T('Enara can see your answers, so it can help you.', 'إنارة ترى إجاباتك لتساعدك.'))),
          h(Button, { variant: 'ghost', icon: 'retry', onClick: function () { setChecked(false); setPicks({}); } }, T('Try again', 'حاول مرة أخرى')))
          : h('div', { className: 'ek-screen__actions' }, h(Button, { variant: 'leaf', size: 'lg', disabled: !all, onClick: function () { setChecked(true); if (p.onCheck) p.onCheck(picks); } }, T('Check my answers', 'تحقّق من إجاباتي')))) : null,
      L.files && L.files.length ? h('section', { key: 'f', className: 'ek-block' }, SectionHead(T('Lesson files', 'ملفات الدرس')), h('div', { className: 'ek-files' }, L.files.map(function (f, i) { var name = f.name || f, url = f.url; return url ? h('a', { key: i, className: 'ek-file', href: url, target: '_blank', rel: 'noreferrer' }, h(Icon, { name: 'download' }), name) : h('button', { key: i, type: 'button', className: 'ek-file' }, h(Icon, { name: 'download' }), name); }))) : null,
      h('footer', { key: 'end', className: 'ek-lessonfoot' },
        complete ? h(Cheer, { moment: 'lessonDone', lang: p.lang, seed: L.title })
          : h(Button, { variant: 'leaf', icon: 'check', onClick: function () { setComplete(true); if (p.onComplete) p.onComplete(); } }, T('I finished this lesson', 'أنهيت هذا الدرس')),
        p.onNext !== false && h(Button, { size: 'lg', iconEnd: 'arrowRight', onClick: p.onNext }, p.nextLabel || T('Next lesson', 'الدرس التالي')))
    ]);
  }

  /* ---------- TutorScreen (the AI tutor) ---------- */
  var CHAT_EN = [
    { from: 'tutor', text: 'Hi Layla! You have a Fractions quiz on Tuesday. Want to practise first?', jump: 'Open Fractions quiz' },
    { from: 'child', text: 'What is a quarter?' },
    { from: 'tutor', text: 'A quarter is one of 4 equal parts. Cut a pizza into 4 equal slices: each slice is a quarter!', picture: true },
    { from: 'child', text: 'So 2 quarters is a half?' }
  ];
  var HISTORY_EN = [{ id: 'h1', title: 'Quarters and halves', date: '2026-11-15', count: 12 }, { id: 'h2', title: 'Counting in tens', date: '2026-11-12', count: 8, live: true }, { id: 'h3', title: 'Story words', date: '2026-11-08', count: 5 }];
  function FractionPicture(p) {
    return h('svg', { className: 'ek-picture', viewBox: '0 0 240 120', role: 'img', 'aria-label': p.label },
      h('circle', { className: 'f-line', cx: 60, cy: 60, r: 48 }),
      h('path', { className: 'f-sun', d: 'M60 60 L60 12 A48 48 0 0 1 108 60 Z' }),
      h('path', { className: 'f-stroke', d: 'M60 12 V108 M12 60 H108' }),
      h('circle', { className: 'f-line', cx: 180, cy: 60, r: 48 }),
      h('path', { className: 'f-leaf', d: 'M180 60 L180 12 A48 48 0 0 1 180 108 Z' }),
      h('path', { className: 'f-stroke', d: 'M180 12 V108' }));
  }
  function TutorScreen(p) {
    var T = tr(p.lang), N = nr(p.lang), msgs = p.messages || CHAT_EN;
    var a = useState(p.view || 'chat'), view = a[0], setView = a[1];
    var b = useState(''), text = b[0], setText = b[1];
    function send(t) { t = (t || '').trim(); if (!t) return; setText(''); if (p.onSend) p.onSend(t); }
    var sessions = p.sessions || HISTORY_EN;
    return Screen(p, 'ek-screen--tutor', [
      h('header', { key: 'h', className: 'ek-tutorhead' },
        h(Mark, { className: 'ek-tutorhead__mark' }),
        h('div', null, h('h1', { className: 'ek-tutorhead__title' }, T('Enara, your tutor', 'إنارة، معلّمتك')), h('span', { className: 'ek-muted' }, T('Ready to help', 'جاهزة للمساعدة'))),
        (p.onLive || !p.onSend) && h(Button, { variant: 'sun', icon: 'video', size: 'sm', onClick: p.onLive }, T('Talk live', 'تحدّث مباشرة')),
        p.onClose && h(Button, { variant: 'ghost', icon: 'close', label: T('Close', 'إغلاق'), onClick: p.onClose })),
      h('div', { key: 't', className: 'ek-segment ek-segment--wide', role: 'tablist' },
        h('button', { type: 'button', role: 'tab', 'aria-selected': view === 'chat', 'aria-pressed': view === 'chat', onClick: function () { setView('chat'); } }, T('Chat', 'محادثة')),
        h('button', { type: 'button', role: 'tab', 'aria-selected': view === 'history', 'aria-pressed': view === 'history', onClick: function () { setView('history'); } }, T('Past chats', 'محادثات سابقة'))),
      view === 'chat' ? h('div', { key: 'c', className: 'ek-chat' },
        msgs.map(function (m, i) {
          return h(TutorBubble, { key: i, from: m.from, lang: p.lang, name: false, onReadAloud: m.from === 'tutor' ? (p.onReadAloud ? function () { p.onReadAloud(m.text); } : function () {}) : undefined },
            h('span', { className: 'ek-chat__text' }, m.text),
            m.picture && h('div', { className: 'ek-chat__pic' }, h(FractionPicture, { label: T('A circle cut into quarters and a circle cut in half', 'دائرة مقسومة أرباعًا ودائرة مقسومة نصفين') }), h(Button, { variant: 'ghost', size: 'sm', icon: 'image' }, T('Make it bigger', 'كبّر الصورة'))),
            m.jump && h('div', null, h(Button, { size: 'sm', iconEnd: 'arrowRight', className: 'ek-chat__jump', onClick: m.onJump }, m.jump)),
            // kidsAudioVisual: picture choices (tap = answer, read aloud); the last tutor message only.
            m.pics && m.pics.length > 1 && i === msgs.length - 1 && h('div', { className: 'ek-pics', role: 'group', 'aria-label': T('Tap a picture', 'اضغط على صورة') },
              m.pics.map(function (c) {
                return h('div', { key: c.word, className: 'ek-pics__item' },
                  h('button', { type: 'button', className: 'ek-pics__pick', 'aria-label': c.word, onClick: function () { if (p.onReadAloud) p.onReadAloud(c.word); send(c.word); } },
                    h('img', { src: c.src, alt: '', width: 72, height: 72, loading: 'lazy' }), h('span', { className: 'ek-pics__word' }, c.word)),
                  h('button', { type: 'button', className: 'ek-pics__say', 'aria-label': T('Listen: ', 'استمع: ') + c.word, onClick: function () { if (p.onReadAloud) p.onReadAloud(c.word); } }, '\uD83D\uDD0A'));
              })));
        }),
        msgs.length === 0 && h(TutorBubble, { lang: p.lang, name: false }, p.greeting || T('Hi! I’m Enara. What would you like to learn about?', 'مرحبًا! أنا إنارة. ماذا تحب أن تتعلّم؟')),
        (p.thinking === undefined ? !p.onSend : p.thinking) && h('div', { className: 'ek-thinking', role: 'status' }, h('span', { className: 'ek-dots', 'aria-hidden': true }, h('i'), h('i'), h('i')), T('Enara is thinking…', 'إنارة تفكّر…')))
        : h('div', { key: 'hs', className: 'ek-history' },
          SectionHead(T('Your past chats', 'محادثاتك السابقة'), p.onClearAll !== false && h('button', { type: 'button', className: 'ek-link', onClick: p.onClearAll }, T('Clear all', 'امسح الكل'))),
          !sessions.length && h('p', { className: 'ek-muted' }, T('No past chats yet.', 'لا محادثات سابقة بعد.')),
          sessions.map(function (s) { return h(TaskCard, { key: s.id, kind: 'tutor', icon: s.live ? 'video' : 'message', title: s.title, meta: dateLabel(s.date, p.lang) + sep(p.lang) + T(N(s.count) + ' messages', N(s.count) + ' رسائل') + (s.live ? T(' · live call', '، مكالمة مباشرة') : ''), lang: p.lang, action: h(Button, { variant: 'ghost', size: 'sm', iconEnd: 'chevronRight', onClick: p.onOpenSession ? function () { p.onOpenSession(s.id); setView('chat'); } : undefined }, T('Open', 'افتح')) }); })),
      view === 'chat' && h('div', { key: 'chips', className: 'ek-chips' },
        h(Button, { variant: 'ghost', size: 'sm', icon: 'image', onClick: function () { send(T('Can you draw a picture to explain it?', 'هل يمكنك أن ترسم صورة لتشرحها؟')); } }, T('Draw it for me', 'ارسمها لي')),
        h(Button, { variant: 'ghost', size: 'sm', icon: 'pencil', onClick: function () { send(T('Quiz me with one easy question.', 'اختبرني بسؤال واحد سهل.')); } }, T('Quiz me', 'اختبرني')),
        h(Button, { variant: 'ghost', size: 'sm', icon: 'hint', onClick: function () { send(T('Can you give me a hint?', 'هل يمكنك أن تعطيني تلميحًا؟')); } }, T('Give me a hint', 'أعطني تلميحًا'))),
      view === 'chat' && h(ChatComposer, { key: 'cmp', lang: p.lang, value: text, onChange: function (e) { setText(e.target.value); }, onSend: function () { send(text); }, onMic: p.onMic === undefined ? function () {} : p.onMic, listening: p.listening })
    ]);
  }

  /* ---------- ProgressScreen (My skills) ---------- */
  var SKILLS_EN = [
    { id: 'o1', title: 'Halves and quarters', level: 'developing', needsCheck: true, group: 'help', course: 'Maths', answers: [{ date: '2026-11-14', right: true, type: 'Quiz' }, { date: '2026-11-12', right: false, type: 'Quick check' }, { date: '2026-11-10', right: true, type: 'Practice' }] },
    { id: 'o2', title: 'Counting in tens', level: 'emerging', group: 'help', learnFirst: 'Counting to 50', course: 'Maths' },
    { id: 'o3', title: 'Bigger or smaller', level: 'not_assessed', group: 'next', course: 'Maths' },
    { id: 'o4', title: 'Counting to 50', level: 'proficient', group: 'all', course: 'Maths' },
    { id: 'o5', title: 'Shapes around us', level: 'mastered', group: 'all', course: 'Maths' },
    { id: 'o6', title: 'Reading short stories', level: 'proficient', group: 'all', course: 'English' }
  ];
  var PLAN_STEPS_EN = [{ id: 'p1', title: 'Halves and quarters', from: 'teacher', status: 'in_progress' }, { id: 'p2', title: 'Counting in tens', from: 'you', status: 'practice_done' }];
  function ProgressScreen(p) {
    var T = tr(p.lang), N = nr(p.lang), skills = p.skills || SKILLS_EN, plan = p.plan || PLAN_STEPS_EN;
    var a = useState(p.openSkill || null), open = a[0], setOpen = a[1];
    if (p.state === 'off') return Screen(p, '', h(StateMessage, { lang: p.lang, icon: 'sprout', title: T('Skills aren’t turned on for your school yet', 'المهارات غير مفعّلة لمدرستك بعد') }));
    if (p.state === 'empty') return Screen(p, '', h(StateMessage, { lang: p.lang, icon: 'sprout', title: T('Your teachers haven’t added skills yet', 'لم يضف معلّموك مهارات بعد') }));
    if (p.state === 'loading' || p.state === 'error') return Screen(p, '', h(StateMessage, { kind: p.state, lang: p.lang, onRetry: p.onRetry }));
    var counts = {}; Object.keys(LEVELS).forEach(function (k) { counts[k] = 0; }); skills.forEach(function (s) { counts[s.level]++; });
    var sk = open && skills.filter(function (s) { return s.id === open; })[0];
    function card(s) {
      return h('button', { key: s.id, type: 'button', className: 'ek-skillcard', onClick: function () { setOpen(s.id); if (p.onOpenSkill) p.onOpenSkill(s); } },
        h('span', { className: 'ek-skillcard__title' }, s.title),
        h(SkillBadge, { level: s.level, lang: p.lang }),
        s.needsCheck && h('span', { className: 'ek-skillcard__note' }, h(Icon, { name: 'target' }), T('Needs one more check', 'تحتاج تحقّقًا آخر')),
        s.learnFirst && h('span', { className: 'ek-skillcard__note' }, h(Icon, { name: 'sprout' }), T('Learn first: ', 'تعلّم أولًا: ') + s.learnFirst));
    }
    var groups = [['help', T('Needs a little help', 'تحتاج مساعدة بسيطة')], ['next', T('Ready to learn next', 'جاهزة للتعلّم')], ['all', T('All my skills', 'كل مهاراتي')]];
    var growing = counts.mastered + counts.proficient;
    return Screen(p, 'ek-screen--wide ek-screen--progress', [
      growing ? h(Cheer, { key: 'cheer', moment: 'skillUp', lang: p.lang, seed: growing, icon: 'sprout' }) : null,
      h('header', { key: 'h', className: 'ek-pagehead' }, h('h1', { className: 'ek-pagehead__title' }, T('My skills', 'مهاراتي')),
        h('p', { className: 'ek-pagehead__sub' }, T('See how your skills are growing. This is a guess from your answers so far, not a grade.', 'شاهد كيف تكبر مهاراتك. هذا تقدير من إجاباتك حتى الآن، وليس درجة.'))),
      h('div', { key: 'lv', className: 'ek-levels' }, ['mastered', 'proficient', 'developing', 'emerging', 'not_assessed'].map(function (k) {
        return h('div', { key: k, className: 'ek-levels__tile' }, h('strong', null, N(counts[k])), h(SkillBadge, { level: k, lang: p.lang }));
      })),
      (p.recommendation === undefined || p.recommendation) && h('section', { key: 'rec', className: 'ek-block' }, SectionHead(T('Try this next', 'جرّب هذا')),
        (function (r) { return h(TaskCard, { kind: 'review', icon: 'target', highlight: true, lang: p.lang, title: r.title, meta: r.text,
          action: h(Button, { variant: 'sun', size: 'sm', onClick: p.onRecommendation ? function () { p.onRecommendation(r); } : p.onQuickCheck }, r.action || T('Quick check', 'تحقّق سريع')) }); })(p.recommendation || { title: T('Halves and quarters', 'الأنصاف والأرباع'), text: T('You answered some of these right. A quick check will show if you’ve got it.', 'أجبت بعضها صحيحًا. تحقّق سريع سيُظهر إن كنت أتقنتها.') })),
      h('section', { key: 'plan', className: 'ek-block' }, SectionHead(T('My practice plan', 'خطة تدريبي')),
        h('div', { className: 'ek-steps' }, plan.map(function (s) {
          var practiced = s.status === 'practice_done';
          return h(TaskCard, { key: s.id, kind: 'plan', lang: p.lang, title: s.title,
            tag: h(Sticker, { color: s.from === 'teacher' ? 'blue' : 'bubblegum' }, s.from === 'teacher' ? T('From your teacher', 'من معلّمك') : T('Your choice', 'اختيارك')),
            children: h('div', { className: 'ek-twostep' },
              h('span', { className: cx('ek-twostep__s', practiced ? 'is-done' : 'is-current') }, practiced ? h(Icon, { name: 'check' }) : h('b', null, N(1)), T('Practise', 'تدرّب')),
              h('i', { className: cx('ek-twostep__link', practiced && 'is-done') }),
              h('span', { className: cx('ek-twostep__s', practiced && 'is-current') }, h('b', null, N(2)), T('Check', 'تحقّق'))),
            action: practiced ? h(Button, { variant: 'sun', size: 'sm', onClick: p.onPlanCheck ? function () { p.onPlanCheck(s); } : undefined || p.onQuickCheck }, T('Take the check', 'ابدأ التحقّق'))
              : h(Fragment, null, h(Button, { size: 'sm', onClick: p.onPlanPractise ? function () { p.onPlanPractise(s); } : undefined || p.onPractise }, s.status === 'in_progress' ? T('Keep practising', 'تابع التدريب') : T('Start practice', 'ابدأ التدريب')), h(Button, { variant: 'ghost', size: 'sm', icon: 'check', onClick: p.onPlanPractised ? function () { p.onPlanPractised(s); } : undefined }, T('I’ve practised', 'تدرّبت'))) });
        })),
        h('p', { className: 'ek-muted' }, T('Practice helps. The check shows if you’ve really got it.', 'التدريب يساعد، والتحقّق يُظهر إن كنت أتقنتها حقًا.'))),
      groups.map(function (g) {
        var list = skills.filter(function (s) { return g[0] === 'all' ? true : s.group === g[0]; });
        return list.length ? h('section', { key: g[0], className: 'ek-block' }, SectionHead(g[1]), h('div', { className: 'ek-skillgrid' }, list.map(card))) : null;
      }),
      sk && h(Sheet, { key: 'sheet', lang: p.lang, title: sk.title, onClose: function () { setOpen(null); }, inline: p.inlineSheet,
        actions: h(Fragment, null, h(Button, { variant: 'sun', onClick: p.onQuickCheck ? function () { p.onQuickCheck(sk); } : undefined }, T('Quick check', 'تحقّق سريع')), h(Button, { icon: 'message', onClick: p.onPractise ? function () { p.onPractise(sk); } : undefined }, T('Practise with Enara', 'تدرّب مع إنارة'))) },
        h(SkillBadge, { level: sk.level, lang: p.lang }),
        sk.needsCheck && h('p', { className: 'ek-muted' }, T('One more check will show if you’ve really got it.', 'تحقّق آخر سيُظهر إن كنت أتقنتها حقًا.')),
        h('h3', { className: 'ek-sheet__sub' }, T('Your answers', 'إجاباتك')),
        sk.answers && sk.answers.length ? h('ul', { className: 'ek-list' }, sk.answers.map(function (x, i) {
          return h('li', { key: i, className: 'ek-list__row' }, h('span', null, h('strong', null, x.type), h('small', null, dateLabel(x.date, p.lang))),
            h('span', { className: cx('ek-mini', x.right ? 'is-right' : 'is-not') }, h(Icon, { name: x.right ? 'check' : 'retry' }), x.right ? T('Right', 'صحيحة') : T('Not yet', 'ليس بعد')));
        })) : h('p', { className: 'ek-muted' }, T('No answers for this skill yet.', 'لا إجابات لهذه المهارة بعد.')))
    ]);
  }

  /* ---------- QuickCheckScreen (diagnostic) ---------- */
  var CHECK_EN = {
    title: 'Quick check: Halves and quarters',
    questions: [
      { id: 'c1', text: 'Which picture shows a half?', choices: [{ id: 'a', text: 'A pizza cut into 2 equal slices' }, { id: 'b', text: 'A pizza cut into 3 slices' }] },
      { id: 'c2', text: 'Half of 8 is…', choices: [{ id: 'a', text: '2' }, { id: 'b', text: '4' }, { id: 'c', text: '6' }] },
      { id: 'c3', text: 'A quarter is one of … equal parts.', choices: [{ id: 'a', text: '2' }, { id: 'b', text: '4' }, { id: 'c', text: '8' }] }
    ],
    results: [{ id: 'r1', title: 'Halves', result: 'secure', right: 4, of: 4 }, { id: 'r2', title: 'Quarters', result: 'mixed', right: 2, of: 4 }, { id: 'r3', title: 'Sharing equally', result: 'gap', right: 1, of: 4 }]
  };
  var RESULT = { secure: ['You’ve got it!', 'أتقنتها!', 'leaf', 'check'], mixed: ['Almost there', 'اقتربت', 'sun', 'star'], gap: ['Let’s practise', 'لنتدرّب', 'bubblegum', 'sprout'], inconclusive: ['Need more answers', 'نحتاج إجابات أكثر', 'none', 'hint'] };
  function QuickCheckScreen(p) {
    var T = tr(p.lang), N = nr(p.lang), c = Object.assign({}, CHECK_EN, p.check || {});
    var a = useState(p.stage || 'intro'), stage = a[0], setStage = a[1];
    var b = useState(p.index || 0), i = b[0], setI = b[1];
    var d = useState(null), pick = d[0], setPick = d[1];
    var back = h(Button, { key: 'bk', variant: 'ghost', icon: 'arrowLeft', onClick: p.onBack }, T('Back to my skills', 'العودة إلى مهاراتي'));
    if (stage === 'intro') return Screen(p, 'ek-screen--center', [back, h('div', { key: 'c', className: 'ek-card ek-card--narrow' },
      h('span', { className: 'ek-bigicon ek-bigicon--sun' }, h(Icon, { name: 'target', size: 44 })),
      h('h1', { className: 'ek-card__title' }, c.title),
      h('p', { className: 'ek-card__text' }, T('A short check of about 12 questions, one at a time. Just do your best: there’s no score. You’ll see how you did at the end.', 'تحقّق قصير من نحو ١٢ سؤالًا، واحدًا تلو الآخر. ابذل جهدك فقط، فلا توجد درجة. سترى كيف أبليت في النهاية.')),
      h(Button, { size: 'lg', iconEnd: p.busy ? null : 'arrowRight', disabled: p.busy, onClick: function () { if (p.onStart) p.onStart(); else setStage('question'); } }, p.busy ? T('Getting ready…', 'نجهّز…') : T('Start', 'ابدأ')))]);
    if (stage === 'question') {
      var q = p.question || c.questions[i % c.questions.length], qi = p.question ? (p.index || 0) : i, about = p.about || 12;
      return Screen(p, 'ek-screen--question', [
        h('header', { key: 'h', className: 'ek-screen__top' }, h('div', { className: 'ek-screen__trail' },
          h('span', { className: 'ek-kicker' }, T('Question ' + N(qi + 1) + ' of about ' + N(about), 'السؤال ' + N(qi + 1) + ' من نحو ' + N(about))),
          h('div', { className: 'ek-meter' }, h('i', { style: { width: Math.min(100, Math.round(100 * (qi + 1) / about)) + '%' } })))),
        h('h2', { key: 'q', className: 'ek-screen__question' }, q.text),
        h(ChoiceGroup, { key: 'c' + q.id, label: q.text, choices: q.choices, value: pick, lang: p.lang, onChange: setPick }),
        h('footer', { key: 'f', className: 'ek-screen__actions ek-screen__actions--split' },
          h(Button, { variant: 'ghost', onClick: function () { if (p.onStop) p.onStop(); else setStage('results'); } }, T('Stop the check', 'أوقف التحقّق')),
          h(Button, { size: 'lg', disabled: !pick || p.busy, iconEnd: 'arrowRight', onClick: function () { var v = pick; setPick(null); if (p.onAnswer) p.onAnswer(q, v); else if (i >= 2) setStage('results'); else setI(i + 1); } }, T('Next', 'التالي')))
      ]);
    }
    return Screen(p, 'ek-screen--question', [
      h('div', { key: 'top', className: 'ek-reward ek-reward--flat' },
        h('span', { className: 'ek-bigicon ek-bigicon--leaf' }, h(Icon, { name: 'check', size: 44 })),
        h('h1', { className: 'ek-reward__title' }, T('All done!', 'انتهيت!')),
        h('p', { className: 'ek-reward__message' }, p.reason || T('You answered ' + N(c.answered || 12) + ' questions. That was enough to see how you’re doing.', 'أجبت عن ' + N(c.answered || 12) + ' سؤالًا. هذا يكفي لنعرف مستواك.')),
        h(Cheer, { moment: 'checkDone', lang: p.lang, seed: c.title })),
      h('div', { key: 'r', className: 'ek-steps' }, c.results.map(function (r) {
        var R = RESULT[r.result];
        return h(TaskCard, { key: r.id, kind: 'plan', icon: R[3], lang: p.lang, title: r.title,
          tag: h('span', { className: 'ek-chip ek-chip--' + R[2] }, isAr(p.lang) ? R[1] : R[0]),
          meta: T(N(r.right) + ' of ' + N(r.of) + ' right in this check', N(r.right) + ' من ' + N(r.of) + ' صحيحة في هذا التحقّق'),
          action: r.result !== 'secure' && h(Button, { variant: 'ghost', size: 'sm', icon: 'message', onClick: p.onPractise ? function () { p.onPractise(r); } : undefined }, T('Practise with Enara', 'تدرّب مع إنارة')) });
      })),
      h('footer', { key: 'f', className: 'ek-screen__actions' }, h(Button, { size: 'lg', onClick: p.onDone }, T('Done', 'تم')))
    ]);
  }

  /* ---------- AssignmentsScreen (Homework list) ---------- */
  var HW_EN = [
    { id: 'a1', title: 'My favourite animal', subject: 'English', status: 'not_started', due: '2026-11-20', questions: 4 },
    { id: 'a2', title: 'Fractions practice', subject: 'Maths', status: 'in_progress', due: '2026-11-18', questions: 10 },
    { id: 'a3', title: 'Read and answer: The lost kite', subject: 'English', status: 'missing', due: '2026-11-13', late: true },
    { id: 'a4', title: 'Speaking: Talk about your family', subject: 'English', status: 'grading', due: '2026-11-11', speaking: true },
    { id: 'a5', title: 'Plant parts', subject: 'Science', status: 'released', due: '2026-11-07', score: 80 }
  ];
  function AssignmentsScreen(p) {
    var T = tr(p.lang), list = p.assignments || HW_EN;
    var todo = list.filter(function (a) { return ['not_started', 'in_progress', 'missing'].indexOf(a.status) >= 0; });
    var done = list.filter(function (a) { return todo.indexOf(a) < 0; });
    function row(a) {
      var btn = a.status === 'released' ? T('See results', 'شاهد النتيجة') : a.status === 'in_progress' ? T('Keep going', 'تابع') : todo.indexOf(a) >= 0 ? T('Start', 'ابدأ') : T('Open', 'افتح');
      return h(TaskCard, { key: a.id, kind: 'assignment', icon: a.speaking ? 'mic' : null, status: a.status, title: a.title, lang: p.lang, highlight: a.status === 'in_progress',
        meta: [a.subject, a.due && T('Due ', 'موعده ') + dateLabel(a.due, p.lang)].filter(Boolean).join(sep(p.lang)) + (a.late ? sep(p.lang) + T('you can still hand it in', 'ما زال بإمكانك تسليمه') : ''),
        children: a.status === 'released' && h(StarRating, { stars: starsFor(a.score), size: 'sm', lang: p.lang }),
        action: h(Button, { size: 'sm', variant: a.status === 'released' ? 'leaf' : todo.indexOf(a) >= 0 ? 'blue' : 'ghost', iconEnd: 'arrowRight', onClick: p.onOpen ? function () { p.onOpen(a.id); } : undefined }, btn) });
    }
    return Screen(p, 'ek-screen--wide', [
      h('header', { key: 'h', className: 'ek-pagehead' }, h('h1', { className: 'ek-pagehead__title' }, T('Homework', 'واجباتي')), h('p', { className: 'ek-pagehead__sub' }, T('Work your teachers set for you.', 'أعمال طلبها منك معلّموك.'))),
      !list.length ? h(StateMessage, { key: 'e', lang: p.lang, icon: 'clipboard', title: T('No homework yet', 'لا واجبات بعد'), message: T('Work your teachers set will show up here.', 'ستظهر هنا الأعمال التي يطلبها معلّموك.') }) : null,
      todo.length ? h('section', { key: 't', className: 'ek-block' }, SectionHead(T('To do', 'عليك')), h('div', { className: 'ek-steps' }, todo.map(row))) : null,
      done.length ? h('section', { key: 'd', className: 'ek-block' }, SectionHead(T('Handed in', 'سلّمتها')), h('div', { className: 'ek-steps' }, done.map(row))) : null
    ]);
  }

  /* ---------- AssignmentScreen (one piece of homework) ---------- */
  var HW_ONE = {
    title: 'Fractions practice', subject: 'Maths', status: 'in_progress', due: '2026-11-18', questions: 10, minutes: 20, tries: 2,
    instructions: 'Answer all 10 questions. Draw a picture if it helps you!',
    help: 'hints',
    result: { points: 8, max: 10, note: 'Lovely work, Layla! Look again at question 4.', items: [
      { n: 1, text: 'Half of 6 is…', yours: '3', right: true, got: 1, of: 1 },
      { n: 4, text: 'Shade a quarter of the square.', yours: 'Shaded 2 parts', correct: 'Shade 1 of the 4 parts', right: false, got: 0, of: 1, well: 'You split the square into 4 equal parts.', work: 'A quarter is just 1 of those parts.' }
    ] }
  };
  function AssignmentScreen(p) {
    var T = tr(p.lang), N = nr(p.lang), a = Object.assign({}, HW_ONE, p.assignment || {}), view = p.view || 'start';
    var s = useState(false), appeal = s[0], setAppeal = s[1];
    var s2 = useState(''), appealText = s2[0], setAppealText = s2[1];
    var head = h('header', { key: 'h', className: 'ek-lessonhead' },
      h(Button, { variant: 'ghost', icon: 'arrowLeft', label: T('All homework', 'كل الواجبات'), onClick: p.onBack }),
      h('div', null, h('div', { className: 'ek-task__top' }, h(Sticker, { color: 'blue' }, a.subject), h(StatusChip, { status: view === 'results' ? 'released' : view === 'waiting' ? 'grading' : a.status, lang: p.lang })),
        h('h1', { className: 'ek-pagehead__title' }, a.title)));
    if (view === 'waiting') {
      var who = p.waiting || 'enara';
      return Screen(p, 'ek-screen--question', [head, h('div', { key: 'w', className: 'ek-card ek-card--narrow' },
        h('span', { className: 'ek-bigicon ek-bigicon--sky' }, h(Icon, { name: 'hourglass', size: 44 })),
        h('h2', { className: 'ek-card__title' }, cheer('handedIn', p.lang, a.title)),
        h('p', { className: 'ek-card__text' }, who === 'teacher' ? T('Your teacher is checking it. Your result will show up here.', 'معلّمك يراجعه الآن. ستظهر نتيجتك هنا.') : who === 'slow' ? T('Checking is taking a bit longer than usual. Come back soon!', 'المراجعة تأخذ وقتًا أطول قليلًا. عد قريبًا!') : T('Enara is checking your answers…', 'إنارة تراجع إجاباتك…')),
        h(Button, { variant: 'ghost', onClick: p.onBack }, T('Back to homework', 'العودة إلى الواجبات')))]);
    }
    if (view === 'results') {
      var r = a.result;
      return Screen(p, 'ek-screen--question', [head,
        h('div', { key: 's', className: 'ek-reward ek-reward--flat' },
          h(StarRating, { stars: starsFor(100 * r.points / r.max), size: 'lg', lang: p.lang }),
          h('h2', { className: 'ek-reward__title ek-reward__title--md' }, T('You got ' + N(r.points) + ' of ' + N(r.max) + ' points!', 'حصلت على ' + N(r.points) + ' من ' + N(r.max) + ' نقاط!'))),
        h(TutorBubble, { key: 'n', lang: p.lang, name: T('Your teacher says', 'معلّمك يقول'), avatarSrc: p.teacherAvatar }, r.note),
        h('section', { key: 'q', className: 'ek-block' }, SectionHead(T('Your answers', 'إجاباتك')),
          r.items.map(function (x) {
            return h('article', { key: x.n, className: cx('ek-answer', x.right ? 'is-right' : 'is-not') },
              h('header', { className: 'ek-answer__head' }, h('strong', null, N(x.n) + '. ' + x.text), h('span', { className: cx('ek-mini', x.right ? 'is-right' : 'is-not') }, h(Icon, { name: x.right ? 'check' : 'retry' }), T(N(x.got) + ' of ' + N(x.of), N(x.got) + ' من ' + N(x.of)))),
              h('p', null, h('b', null, T('Your answer: ', 'إجابتك: ')), x.yours),
              x.correct && h('p', null, h('b', null, T('Right answer: ', 'الإجابة الصحيحة: ')), x.correct),
              x.well && h('p', { className: 'ek-answer__well' }, h(Icon, { name: 'star' }), h('span', null, h('b', null, T('What went well: ', 'ما أحسنته: ')), x.well)),
              x.work && h('p', { className: 'ek-answer__work' }, h(Icon, { name: 'sprout' }), h('span', null, h('b', null, T('Next time: ', 'في المرة القادمة: ')), x.work)));
          })),
        h('footer', { key: 'f', className: 'ek-screen__actions ek-screen__actions--split' },
          p.appealStatus ? h('span', { className: 'ek-muted' }, p.appealStatus) : p.onAppeal !== false && h(Button, { variant: 'ghost', icon: 'flag', onClick: function () { setAppeal(true); } }, T('Ask my teacher to look again', 'اطلب من معلّمي المراجعة')),
          h(Button, { size: 'lg', icon: 'message', onClick: p.onTutor }, T('Go over it with Enara', 'راجعه مع إنارة'))),
        appeal && h(Sheet, { key: 'ap', lang: p.lang, title: T('Ask your teacher to look again', 'اطلب من معلّمك المراجعة'), onClose: function () { setAppeal(false); }, inline: p.inlineSheet,
          actions: h(Fragment, null, h(Button, { variant: 'ghost', onClick: function () { setAppeal(false); } }, T('Cancel', 'إلغاء')), h(Button, { icon: 'send', disabled: !appealText.trim(), onClick: function () { if (p.onAppeal) p.onAppeal(appealText.trim()); setAppeal(false); } }, T('Send', 'إرسال'))) },
          h(AnswerInput, { multiline: true, value: appealText, onChange: function (e) { setAppealText(e.target.value); }, label: T('What should your teacher look at?', 'ما الذي تريد أن يراجعه معلّمك؟'), placeholder: T('I think question 4 is right because…', 'أظن أن السؤال ٤ صحيح لأن…') }))
      ]);
    }
    var startLabel = a.speaking ? T('Start speaking', 'ابدأ التحدّث') : a.status === 'in_progress' ? T('Keep going', 'تابع') : T('Start', 'ابدأ');
    return Screen(p, 'ek-screen--question', [head,
      h(TutorBubble, { key: 'i', lang: p.lang, name: T('From your teacher', 'من معلّمك') }, a.instructions),
      h('ul', { key: 'm', className: 'ek-facts' },
        h('li', null, h(Icon, { name: 'calendar' }), T('Due ', 'موعده ') + dateLabel(a.due, p.lang)),
        h('li', null, h(Icon, { name: 'pencil' }), T(N(a.questions) + ' questions', N(a.questions) + ' أسئلة')),
        a.minutes && h('li', null, h(Icon, { name: 'hourglass' }), T(N(a.minutes) + ' minutes once you start', N(a.minutes) + ' دقيقة بعد أن تبدأ')),
        a.tries && h('li', null, h(Icon, { name: 'retry' }), T(N(a.tries) + ' tries', N(a.tries) + ' محاولات'))),
      a.late && h('p', { key: 'l', className: 'ek-alert ek-alert--info' }, h(Icon, { name: 'calendar' }), T('You can still hand this in until ', 'ما زال بإمكانك تسليمه حتى ') + dateLabel(a.lateUntil, p.lang)),
      h('footer', { key: 'f', className: 'ek-screen__actions ek-screen__actions--split' },
        a.help !== 'blocked' && h(Button, { variant: 'ghost', icon: 'message', onClick: p.onTutor }, a.help === 'hints' ? T('Get hints from Enara', 'احصل على تلميحات من إنارة') : T('Get help from Enara', 'احصل على مساعدة من إنارة')),
        p.closed ? h('span', { className: 'ek-muted' }, T('This homework is closed.', 'هذا الواجب مغلق.')) : h(Button, { size: 'lg', iconEnd: 'arrowRight', onClick: p.onStart }, startLabel))
    ]);
  }

  /* ---------- WorkScreen (doing homework or a quiz) ---------- */
  var WORK_EN = {
    title: 'Fractions quiz', subject: 'Maths', minutes: 15,
    instructions: 'Read each question carefully. You can go back and change answers before you hand in.',
    questions: [
      { id: 'w1', type: 'multiple-choice', text: 'Which is bigger: a half or a quarter?', choices: [{ id: 'a', text: 'A half' }, { id: 'b', text: 'A quarter' }] },
      { id: 'w2', type: 'true-false', text: 'Two quarters make a half.' },
      { id: 'w3', type: 'short-answer', text: 'Half of 12 is…' },
      { id: 'w4', type: 'open-response', text: 'Tell us how you would share a cake fairly with 3 friends.' }
    ]
  };
  function WorkScreen(p) {
    var T = tr(p.lang), N = nr(p.lang), w = Object.assign({}, WORK_EN, p.work || {}), qs = w.questions;
    var a = useState(p.stage || (p.mode === 'test' ? 'intro' : 'work')), stage = a[0], setStage = a[1];
    var b = useState(p.index || 0), i = b[0], setI = b[1];
    var c = useState(p.answers || {}), ans = c[0], setAns = c[1];
    var d = useState(!!p.confirm), confirm = d[0], setConfirm = d[1];
    // Sample content shows a running timer; real work shows one only when the parent passes secondsLeft.
    var left = p.secondsLeft != null ? p.secondsLeft : (!p.work && w.minutes ? w.minutes * 60 - 260 : null);
    var answered = qs.filter(function (q) { return ans[q.id]; }).length;
    function set(v) { var o = Object.assign({}, ans); o[qs[i].id] = v; setAns(o); if (p.onChange) p.onChange(o); }
    if (stage === 'intro') return Screen(p, 'ek-screen--center', h('div', { className: 'ek-card ek-card--narrow' },
      h('span', { className: 'ek-bigicon ek-bigicon--bubblegum' }, h(Icon, { name: 'pencil', size: 44 })),
      h('h1', { className: 'ek-card__title' }, w.title),
      h('ul', { className: 'ek-facts ek-facts--center' }, h('li', null, h(Sticker, { color: 'blue' }, w.subject)), h('li', null, h(Icon, { name: 'pencil' }), T(N(qs.length) + ' questions', N(qs.length) + ' أسئلة')), h('li', null, h(Icon, { name: 'hourglass' }), T(N(w.minutes) + ' minutes', N(w.minutes) + ' دقيقة'))),
      w.instructions && h(TutorBubble, { lang: p.lang, name: T('From your teacher', 'من معلّمك') }, w.instructions),
      h('p', { className: 'ek-muted' }, T('Work on your own. Your teacher will see your answers.', 'اعمل وحدك. سيرى معلّمك إجاباتك.')),
      h(Button, { size: 'lg', iconEnd: p.busy ? null : 'arrowRight', disabled: p.busy, onClick: function () { if (p.onStart) p.onStart(); setStage('work'); } }, p.busy ? T('Getting ready…', 'نجهّز…') : T('Start', 'ابدأ')),
      h('button', { type: 'button', className: 'ek-link', onClick: p.onExit }, T('Not now', 'ليس الآن'))));
    var q = qs[i], v = ans[q.id] || null;
    var input = q.type === 'multiple-choice' ? h(ChoiceGroup, { key: q.id, label: q.text, choices: q.choices, value: v, lang: p.lang, onChange: set })
      : q.type === 'true-false' ? h(ChoiceGroup, { key: q.id, label: q.text, columns: 2, letters: false, choices: q.choices || [{ id: 'true', text: h(Fragment, null, h(Icon, { name: 'check' }), T('True', 'صح')) }, { id: 'false', text: h(Fragment, null, h(Icon, { name: 'close' }), T('False', 'خطأ')) }], value: v, lang: p.lang, onChange: set })
      : h(AnswerInput, { key: q.id, label: T('Your answer', 'إجابتك'), multiline: q.type === 'open-response', value: v || '', placeholder: q.type === 'open-response' ? T('Write your answer here…', 'اكتب إجابتك هنا…') : T('Type your answer', 'اكتب إجابتك'), onChange: function (e) { set(e.target.value); } });
    return Screen(p, 'ek-screen--question ek-screen--work', [
      h('header', { key: 'h', className: 'ek-workhead' },
        h(Button, { variant: 'ghost', icon: 'close', label: T('Leave', 'خروج'), onClick: p.onExit }),
        h('div', { className: 'ek-workhead__mid' }, h('strong', null, w.title), h('span', { className: 'ek-muted' }, T(N(answered) + ' of ' + N(qs.length) + ' answered', 'أجبت ' + N(answered) + ' من ' + N(qs.length)) + (p.saved === false ? '' : sep(p.lang) + T('saved', 'محفوظ')))),
        left != null && h(TimerBar, { secondsLeft: left, total: (w.minutes || 1) * 60, lang: p.lang })),
      h('ol', { key: 'nav', className: 'ek-qnav', 'aria-label': T('Questions', 'الأسئلة') }, qs.map(function (x, k) {
        return h('li', { key: x.id }, h('button', { type: 'button', className: cx('ek-qnav__b', ans[x.id] && 'is-answered', k === i && 'is-current'), 'aria-current': k === i ? 'step' : undefined, 'aria-label': T('Question ' + (k + 1), 'السؤال ' + N(k + 1)) + (ans[x.id] ? T(', answered', '، تمت الإجابة') : ''), onClick: function () { setI(k); } }, N(k + 1)));
      })),
      h('span', { key: 'k', className: 'ek-kicker' }, T('Question ' + N(i + 1) + ' of ' + N(qs.length), 'السؤال ' + N(i + 1) + ' من ' + N(qs.length))),
      h('h2', { key: 'q', className: 'ek-screen__question' }, q.text),
      input,
      h('footer', { key: 'f', className: 'ek-screen__actions ek-screen__actions--split' },
        h(Button, { variant: 'ghost', icon: 'arrowLeft', disabled: i === 0, onClick: function () { setI(i - 1); } }, T('Back', 'السابق')),
        i < qs.length - 1 ? h(Button, { size: 'lg', iconEnd: 'arrowRight', onClick: function () { setI(i + 1); } }, T('Next', 'التالي'))
          : h(Button, { size: 'lg', variant: 'leaf', icon: 'check', onClick: function () { setConfirm(true); } }, T('Hand in', 'سلّم'))),
      confirm && h(Sheet, { key: 'cf', lang: p.lang, inline: p.inlineSheet, title: T('Ready to hand in?', 'جاهز للتسليم؟'), onClose: function () { setConfirm(false); },
        actions: h(Fragment, null, h(Button, { variant: 'ghost', onClick: function () { setConfirm(false); } }, T('Keep working', 'تابع العمل')), h(Button, { variant: 'leaf', icon: 'check', disabled: p.busy || (p.requireAll && answered < qs.length), onClick: function () { if (p.onSubmit) p.onSubmit(ans); } }, p.busy ? T('Handing in…', 'جارٍ التسليم…') : T('Hand it in', 'سلّمه'))) },
        h('p', { className: 'ek-sheet__text' }, T('You answered ' + N(answered) + ' of ' + N(qs.length) + ' questions. After you hand in, you can’t change your answers.', 'أجبت عن ' + N(answered) + ' من ' + N(qs.length) + ' أسئلة. بعد التسليم لا يمكنك تغيير إجاباتك.')),
        answered < qs.length && h('p', { className: 'ek-alert ek-alert--info' }, h(Icon, { name: 'hint' }), p.requireAll ? T('Answer every question before you hand in.', 'أجب عن كل الأسئلة قبل التسليم.') : T('Some questions have no answer yet.', 'بعض الأسئلة بلا إجابة بعد.')))
    ]);
  }

  /* ---------- SpeakingScreen ---------- */
  function SpeakingScreen(p) {
    var T = tr(p.lang), N = nr(p.lang), stage = p.stage || 'setup', rec = p.rec || 'idle';
    var a = useState(p.micOk || false), micOk = a[0], setMicOk = a[1];
    var b = useState(!!p.agreed), agreed = b[0], setAgreed = b[1];
    var topic = p.topic || T('Talk about your family', 'تحدّث عن عائلتك');
    if (stage === 'setup') return Screen(p, 'ek-screen--question', [
      h('header', { key: 'h', className: 'ek-pagehead' }, h(Sticker, { color: 'bubblegum', icon: 'mic' }, T('Speaking', 'تحدّث')), h('h1', { className: 'ek-pagehead__title' }, topic),
        h('p', { className: 'ek-pagehead__sub' }, T('Enara will ask you questions. Answer out loud. You have ' + N(30) + ' seconds to think first.', 'ستسألك إنارة أسئلة، فأجب بصوتك. لديك ' + N(30) + ' ثانية للتفكير أولًا.'))),
      h('section', { key: 's1', className: 'ek-setup' },
        h('span', { className: cx('ek-setup__n', micOk && 'is-done') }, micOk ? h(Icon, { name: 'check' }) : N(1)),
        h('div', null, h('h2', { className: 'ek-section-title' }, T('Check your microphone', 'جرّب الميكروفون')),
          h('p', { className: 'ek-muted' }, micOk ? T('Your microphone works!', 'الميكروفون يعمل!') : T('Press the button and say hello.', 'اضغط الزر وقل مرحبًا.')),
          h('div', { className: 'ek-level', 'aria-hidden': true }, [1, 2, 3, 4, 5, 6, 7, 8].map(function (k) { return h('i', { key: k, className: micOk && k < 6 ? 'is-on' : '' }); }))),
        h(Button, { variant: micOk ? 'ghost' : 'sun', icon: 'mic', onClick: function () { setMicOk(true); } }, micOk ? T('Test again', 'جرّب مرة أخرى') : T('Test microphone', 'جرّب الميكروفون'))),
      h('section', { key: 's2', className: 'ek-setup' },
        h('span', { className: cx('ek-setup__n', agreed && 'is-done') }, agreed ? h(Icon, { name: 'check' }) : N(2)),
        h('label', { className: 'ek-tick' }, h('input', { type: 'checkbox', checked: agreed, onChange: function (e) { setAgreed(e.target.checked); } }),
          h('span', null, T('I know my voice will be recorded so my teacher can listen to it.', 'أعرف أن صوتي سيُسجَّل ليستمع إليه معلّمي.')))),
      h('label', { key: 'typed', className: 'ek-tick ek-tick--quiet' }, h('input', { type: 'checkbox' }), h('span', null, T('I will type my answers instead (only if my teacher said so).', 'سأكتب إجاباتي بدلًا من ذلك (فقط إذا سمح معلّمي).'))),
      h('footer', { key: 'f', className: 'ek-screen__actions' }, h(Button, { size: 'lg', variant: 'leaf', icon: 'mic', disabled: !(micOk && agreed), onClick: p.onStart }, T('Start speaking', 'ابدأ التحدّث')))
    ]);
    var recBtn = rec === 'recording' ? h(Button, { size: 'lg', variant: 'coral', icon: 'stop' }, T('Stop and send', 'أوقف وأرسل'))
      : rec === 'sending' ? h('div', { className: 'ek-thinking' }, h('span', { className: 'ek-dots' }, h('i'), h('i'), h('i')), T('Enara is listening…', 'إنارة تستمع…'))
      : rec === 'done' ? h(Button, { size: 'lg', variant: 'leaf', icon: 'check', onClick: p.onSubmit }, T('Hand it in', 'سلّمه'))
      : h(Button, { size: 'lg', icon: 'mic', disabled: rec === 'speaking' }, rec === 'speaking' ? T('Enara is talking…', 'إنارة تتكلّم…') : T('Record my answer', 'سجّل إجابتي'));
    return Screen(p, 'ek-screen--question', [
      h('header', { key: 'h', className: 'ek-workhead' }, h(Sticker, { color: 'bubblegum', icon: 'mic' }, T('Speaking', 'تحدّث')),
        h('div', { className: 'ek-workhead__mid' }, h('strong', null, topic), h('span', { className: 'ek-muted' }, T(N(3) + ' answers left', 'باقي ' + N(3) + ' إجابات'))), h(TimerBar, { secondsLeft: 340, total: 480, lang: p.lang })),
      h('div', { key: 'c', className: 'ek-chat' },
        h(TutorBubble, { lang: p.lang, onReadAloud: function () {} }, T('Hello! Who is in your family?', 'مرحبًا! من في عائلتك؟')),
        h(TutorBubble, { from: 'child', lang: p.lang, name: T('What we heard', 'ما سمعناه') }, T('I have a mum, a dad and a little brother called Omar.', 'عندي أمّ وأبّ وأخ صغير اسمه عمر.')),
        h(TutorBubble, { lang: p.lang, onReadAloud: function () {} }, T('Lovely! What do you like to do with Omar?', 'جميل! ماذا تحبّ أن تفعل مع عمر؟')),
        rec === 'recording' && h('div', { className: 'ek-recording', role: 'status' }, h('span', { className: 'ek-recording__dot' }), T('Recording… you can talk for up to ' + N(85) + ' seconds', 'جارٍ التسجيل… يمكنك التحدّث حتى ' + N(85) + ' ثانية'),
          h('div', { className: 'ek-level', 'aria-hidden': true }, [1, 2, 3, 4, 5, 6, 7, 8].map(function (k) { return h('i', { key: k, className: k < 5 ? 'is-on' : '' }); }))),
        rec === 'done' && h(Cheer, { moment: 'speakingDone', lang: p.lang, seed: topic }),
        rec === 'done' && h('p', { className: 'ek-alert ek-alert--ok' }, h(Icon, { name: 'check' }), T('All your answers are saved. Hand it in so your teacher can listen.', 'كل إجاباتك محفوظة. سلّمها ليستمع إليها معلّمك.')),
        p.error && h('p', { className: 'ek-alert', role: 'alert' }, h(Icon, { name: 'retry' }), T('We couldn’t hear you. Get closer to the microphone and try again.', 'لم نسمعك. اقترب من الميكروفون وحاول مرة أخرى.'))),
      h('footer', { key: 'f', className: 'ek-screen__actions ek-screen__actions--center' }, recBtn)
    ]);
  }

  /* ---------- PlanScreen (Study plan) ---------- */
  var PLAN_EN = [
    { id: 'p1', source: 'assignment', title: 'Fractions practice', due: '2026-11-18', why: 'It is due on Tuesday.', minutes: 20 },
    { id: 'p2', source: 'teacher', title: 'Read “The lost kite” again', why: 'Ms Sara wants you to practise reading out loud.', minutes: 10 },
    { id: 'p3', source: 'suggested', title: 'Practise quarters with Enara', why: 'You are getting close to a star skill.', minutes: 5 }
  ];
  var PLAN_AR = [
    { id: 'p1', source: 'assignment', title: 'تدريب الكسور', due: '2026-11-18', why: 'موعده يوم الثلاثاء.', minutes: 20 },
    { id: 'p2', source: 'teacher', title: 'اقرأ قصة «الطائرة الورقية» مرة أخرى', why: 'تريد الأستاذة سارة أن تتدرّب على القراءة بصوت عالٍ.', minutes: 10 },
    { id: 'p3', source: 'suggested', title: 'تدرّب على الأرباع مع إنارة', why: 'أنت قريب من مهارة نجمة.', minutes: 5 }
  ];
  var SOURCE = { assignment: ['Homework', 'واجب', 'blue'], teacher: ['From your teacher', 'من معلّمك', 'leaf'], results: ['From your results', 'من نتائجك', 'sun'], suggested: ['Enara’s idea', 'فكرة إنارة', 'bubblegum'] };
  function PlanScreen(p) {
    var T = tr(p.lang), N = nr(p.lang), items = p.items || (isAr(p.lang) ? PLAN_AR : PLAN_EN);
    var a = useState(p.done || []), done = a[0], setDone = a[1];
    var b = useState(false), showDone = b[0], setShowDone = b[1];
    var c = useState(p.justDone || null), justDone = c[0], setJustDone = c[1];
    var todo = items.filter(function (x) { return done.indexOf(x.id) < 0; }), finished = items.filter(function (x) { return done.indexOf(x.id) >= 0; });
    var setAside = finished.length;
    return Screen(p, 'ek-screen--wide', [
      h('header', { key: 'h', className: 'ek-pagehead' }, h('h1', { className: 'ek-pagehead__title' }, T('My plan', 'خطتي')), h('p', { className: 'ek-pagehead__sub' }, T('Here’s what to do next, one step at a time.', 'هذا ما عليك فعله، خطوة بخطوة.'))),
      justDone ? h(Cheer, { key: 'cheer', moment: 'planDone', lang: p.lang, seed: justDone }) : null,
      todo.length ? h('ol', { key: 'l', className: 'ek-plan' }, todo.map(function (x, i) {
        var S = SOURCE[x.source];
        return h('li', { key: x.id, className: 'ek-plan__item' }, h('span', { className: 'ek-plan__n' }, N(i + 1)),
          h(TaskCard, { kind: 'plan', icon: x.source === 'suggested' ? 'sprout' : x.source === 'assignment' ? 'clipboard' : 'star', lang: p.lang, title: x.title,
            tag: h(Sticker, { color: S[2] }, isAr(p.lang) ? S[1] : S[0]),
            meta: [x.due && T('Due ', 'موعده ') + dateLabel(x.due, p.lang), T('About ' + N(x.minutes) + ' minutes', 'نحو ' + N(x.minutes) + ' دقائق')].filter(Boolean).join(sep(p.lang)),
            note: x.why,
            action: h(Fragment, null,
              h(Button, { size: 'sm', icon: x.source === 'assignment' ? null : 'message', iconEnd: x.source === 'assignment' ? 'arrowRight' : null, onClick: p.onOpen ? function () { p.onOpen(x); } : undefined }, x.source === 'assignment' ? T('Open', 'افتح') : T('Do it with Enara', 'مع إنارة')),
              h(Button, { size: 'sm', variant: 'leaf', icon: 'check', onClick: function () { setDone(done.concat([x.id])); setJustDone(x.id); if (p.onDone) p.onDone(x); } }, T('Done!', 'تمّ!')),
              x.source === 'suggested' && h(Button, { size: 'sm', variant: 'ghost', onClick: function () { setDone(done.concat([x.id])); if (p.onDismiss) p.onDismiss(x); } }, T('Not now', 'ليس الآن'))) }));
      })) : h(StateMessage, { key: 'e', lang: p.lang, icon: 'check', title: T('Nothing to do right now!', 'لا شيء عليك الآن!'), message: T('New homework, notes from your teachers and your results will show up here.', 'الواجبات الجديدة وملاحظات معلّميك ونتائجك ستظهر هنا.') }),
      h('section', { key: 'd', className: 'ek-block' },
        h('button', { type: 'button', className: 'ek-disclosure', 'aria-expanded': showDone, onClick: function () { setShowDone(!showDone); } }, h(Icon, { name: 'chevronRight', className: showDone ? 'is-open' : '' }), T('Done or set aside (' + N(setAside) + ')', 'منتهية أو مؤجّلة (' + N(setAside) + ')')),
        showDone && h('ul', { className: 'ek-list' }, finished.map(function (x) { return h('li', { key: x.id, className: 'ek-list__row' }, h('span', null, h('strong', null, x.title)), h(Button, { variant: 'ghost', size: 'sm', icon: 'retry', onClick: function () { setDone(done.filter(function (y) { return y !== x.id; })); if (p.onRestore) p.onRestore(x); } }, T('Put back', 'أعده'))); })))
    ]);
  }

  /* ---------- QuizzesScreen (Assessments tab) ---------- */
  var QUIZ_EN = [
    { id: 'z1', subject: 'Maths', title: 'Fractions quiz', questions: 8, minutes: 15, status: 'open' },
    { id: 'z2', subject: 'English', title: 'Spelling test', questions: 10, minutes: 10, status: 'open' },
    { id: 'z3', subject: 'Science', title: 'Plants check', questions: 6, minutes: 10, status: 'upcoming' },
    { id: 'z4', subject: 'Maths', title: 'Shapes quiz', questions: 8, minutes: 15, status: 'closed' }
  ];
  function QuizzesScreen(p) {
    var T = tr(p.lang), N = nr(p.lang), list = p.quizzes || QUIZ_EN;
    return Screen(p, 'ek-screen--wide', [
      h('header', { key: 'h', className: 'ek-pagehead' }, h('h1', { className: 'ek-pagehead__title' }, T('Quizzes', 'اختباراتي'))),
      list.length ? h('div', { key: 'g', className: 'ek-cards' }, list.map(function (z) {
        var open = z.status === 'open';
        return h('article', { key: z.id, className: cx('ek-quizcard', !open && 'is-off') },
          h('div', { className: 'ek-task__top' }, h(Sticker, { color: open ? 'bubblegum' : 'none' }, z.subject), h(StatusChip, { status: z.status, lang: p.lang })),
          h('h3', { className: 'ek-lesson__title' }, z.title),
          h('p', { className: 'ek-muted' }, T(N(z.questions) + ' questions · ' + N(z.minutes) + ' minutes', N(z.questions) + ' أسئلة، ' + N(z.minutes) + ' دقيقة')),
          h(Button, { variant: open ? 'blue' : 'ghost', disabled: !open, iconEnd: open ? 'arrowRight' : null, onClick: open && p.onStart ? function () { p.onStart(z.id); } : undefined }, open ? T('Start', 'ابدأ') : z.status === 'closed' ? T('Closed', 'مغلق') : T('Not open yet', 'لم يُفتح بعد')));
      })) : h(StateMessage, { key: 'e', lang: p.lang, icon: 'pencil', title: T('No quizzes right now', 'لا اختبارات الآن') })
    ]);
  }

  /* ---------- ResultsScreen ---------- */
  var RES_EN = [
    { id: 'x1', subject: 'Maths', title: 'Shapes quiz', date: '2026-11-12', score: 90, great: 'Triangles', next: 'Hexagons' },
    { id: 'x2', subject: 'English', title: 'Spelling test', date: '2026-11-10', score: 65, great: 'Short words', next: 'Words with “ee”' },
    { id: 'x3', subject: 'Science', title: 'Animals quiz', date: '2026-11-03', score: 45, great: 'Pets', next: 'Wild animals' }
  ];
  var TOPICS_EN = [{ t: 'Triangles', s: 95 }, { t: 'Short words', s: 85 }, { t: 'Counting', s: 75 }, { t: 'Words with “ee”', s: 55 }, { t: 'Wild animals', s: 40 }];
  function scoreLevel(s) { return s >= 90 ? 'mastered' : s >= 80 ? 'proficient' : s >= 60 ? 'developing' : 'emerging'; }
  function ResultsScreen(p) {
    var T = tr(p.lang), N = nr(p.lang), list = p.results || RES_EN;
    var a = useState(p.view || 'quizzes'), view = a[0], setView = a[1];
    var b = useState(p.open || null), open = b[0], setOpen = b[1];
    var cur = open && list.filter(function (x) { return x.id === open; })[0];
    return Screen(p, 'ek-screen--wide', [
      h('header', { key: 'h', className: 'ek-pagehead' }, h('h1', { className: 'ek-pagehead__title' }, T('My results', 'نتائجي')), h('p', { className: 'ek-pagehead__sub' }, T('See how your quizzes went and what to practise next.', 'شاهد كيف كانت اختباراتك وما تتدرّب عليه.'))),
      h('div', { key: 't', className: 'ek-segment ek-segment--wide' },
        h('button', { type: 'button', 'aria-pressed': view === 'quizzes', onClick: function () { setView('quizzes'); } }, T('My quizzes', 'اختباراتي')),
        h('button', { type: 'button', 'aria-pressed': view === 'topics', onClick: function () { setView('topics'); } }, T('My topics', 'موضوعاتي'))),
      view === 'quizzes' ? (list.length ? h('div', { key: 'l', className: 'ek-steps' }, list.map(function (x) {
        return h(TaskCard, { key: x.id, kind: 'quiz', icon: 'trophy', lang: p.lang, title: x.title, tag: h(Sticker, { color: 'bubblegum' }, x.subject), meta: dateLabel(x.date, p.lang),
          children: h('div', { className: 'ek-result' }, h(StarRating, { stars: starsFor(x.score), lang: p.lang }),
            x.great && h('span', { className: 'ek-mini is-right' }, h(Icon, { name: 'star' }), T('Great at: ', 'متميّز في: ') + x.great),
            x.next && h('span', { className: 'ek-mini is-next' }, h(Icon, { name: 'sprout' }), T('Practise next: ', 'تدرّب على: ') + x.next)),
          action: h(Button, { variant: 'ghost', size: 'sm', onClick: function () { setOpen(x.id); if (p.onOpen) p.onOpen(x.id); } }, T('How did I do?', 'كيف أبليت؟')) });
      })) : h(StateMessage, { key: 'e', lang: p.lang, icon: 'trophy', title: T('No results yet', 'لا نتائج بعد'), message: T('Finish a quiz and your results will show up here.', 'أنهِ اختبارًا وستظهر نتيجتك هنا.') }))
        : h('div', { key: 'tp', className: 'ek-panel' }, h('ul', { className: 'ek-list' }, (p.topics || TOPICS_EN).map(function (x) {
          return h('li', { key: x.t, className: 'ek-list__row' }, h('strong', null, x.t), h(SkillBadge, { level: scoreLevel(x.s), lang: p.lang }));
        })), h('div', { className: 'ek-row' }, h(Button, { icon: 'calendar', onClick: p.onPlan }, T('Make my practice plan', 'اصنع خطة تدريبي')))),
      cur && h(Sheet, { key: 's', lang: p.lang, inline: p.inlineSheet, title: cur.title, onClose: function () { setOpen(null); },
        actions: h(Fragment, null, h(Button, { variant: 'ghost', icon: 'message', onClick: p.onTutor }, T('Ask Enara', 'اسأل إنارة')), h(Button, { onClick: function () { setOpen(null); } }, T('Got it!', 'فهمت!'))) },
        h(StarRating, { stars: starsFor(cur.score), size: 'lg', lang: p.lang }),
        h('ul', { className: 'ek-facts' }, (cur.minutes != null || !p.results) && h('li', null, h(Icon, { name: 'hourglass' }), T('Time: ' + N(cur.minutes != null ? cur.minutes : 9) + ' minutes', 'الوقت: ' + N(cur.minutes != null ? cur.minutes : 9) + ' دقيقة')), cur.correct != null && h('li', null, h(Icon, { name: 'check' }), T(N(cur.correct) + ' of ' + N(cur.total) + ' right', N(cur.correct) + ' من ' + N(cur.total) + ' صحيحة')), cur.great && h('li', null, h(Icon, { name: 'star' }), T('Great at: ', 'متميّز في: ') + cur.great), cur.next && h('li', null, h(Icon, { name: 'sprout' }), T('Practise next: ', 'تدرّب على: ') + cur.next)),
        cur.answers && cur.answers.length ? h('div', { className: 'ek-steps' }, cur.answers.map(function (x, i) {
          return h('article', { key: i, className: cx('ek-answer', x.right ? 'is-right' : 'is-not') },
            h('header', { className: 'ek-answer__head' }, h('strong', null, N(i + 1) + '. ' + x.text), h('span', { className: cx('ek-mini', x.right ? 'is-right' : 'is-not') }, h(Icon, { name: x.right ? 'check' : 'retry' }), x.right ? T('Right', 'صحيحة') : T('Not yet', 'ليس بعد'))),
            x.yours != null && h('p', null, h('b', null, T('Your answer: ', 'إجابتك: ')), String(x.yours)),
            !x.right && x.correct != null && h('p', null, h('b', null, T('Right answer: ', 'الإجابة الصحيحة: ')), String(x.correct)),
            x.why && h('p', { className: 'ek-why' }, h(Icon, { name: 'hint' }), x.why));
        })) : h('p', { className: 'ek-alert ek-alert--info' }, h(Icon, { name: 'hint' }), cur.loading ? T('Getting your answers…', 'نحضّر إجاباتك…') : T('You can see the right answers when the quiz closes for everyone.', 'سترى الإجابات الصحيحة عندما يُغلق الاختبار للجميع.')))
    ]);
  }

  /* ---------- RewardSheet (end of a lesson or quiz) ---------- */
  function RewardSheet(p) {
    var T = tr(p.lang), N = nr(p.lang);
    var stickers = p.stickers || (p.score != null ? [] : [{ label: T('Number star', 'نجم الأعداد'), color: 'bubblegum' }, { label: T('Tutor friend', 'صديق إنارة'), color: 'leaf', icon: 'message' }]);
    var stars = p.stars != null ? p.stars : p.score != null ? starsFor(p.score) : 3;
    return Screen(p, 'ek-screen--reward', h('div', { className: 'ek-reward', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'ek-reward-title' },
      h(StarRating, { stars: stars, of: p.of || 3, size: 'lg', lang: p.lang }),
      h('h2', { className: 'ek-reward__title', id: 'ek-reward-title' }, p.title || (p.score != null ? cheer('quiz' + Math.max(1, stars), p.lang, p.seed != null ? p.seed : p.correct) : cheer('lessonDone', p.lang, p.seed))),
      h('p', { className: 'ek-reward__message' }, p.message || (p.correct != null ? (p.minutes ? T('You got ' + N(p.correct) + ' of ' + N(p.total) + ' right in ' + N(p.minutes) + ' minutes.', 'أجبت ' + N(p.correct) + ' من ' + N(p.total) + ' صحيحة في ' + N(p.minutes) + ' دقيقة.') : T('You got ' + N(p.correct) + ' of ' + N(p.total) + ' right.', 'أجبت ' + N(p.correct) + ' من ' + N(p.total) + ' صحيحة.')) : T('You finished Numbers to 100 and answered 6 questions.', 'أنهيت الأعداد حتى ١٠٠ وأجبت عن ٦ أسئلة.'))),
      p.topics && p.topics.length ? h('div', { className: 'ek-reward__look' }, h(Icon, { name: 'sprout' }), h('span', null, T('Look again at: ', 'راجع: ') + p.topics.join(isAr(p.lang) ? '، ' : ', ')), h(Button, { variant: 'ghost', size: 'sm', icon: 'message', onClick: p.onTutor }, T('Practise with Enara', 'تدرّب مع إنارة'))) : null,
      stickers.length ? h('div', { className: 'ek-reward__stickers' },
        h('span', { className: 'ek-reward__label' }, T('New badges', 'أوسمة جديدة')),
        h('div', { className: 'ek-reward__row' }, stickers.map(function (s, i) { return h(Sticker, { key: i, color: s.color, icon: s.icon }, s.label); }))) : null,
      h('div', { className: 'ek-reward__actions' },
        p.score != null ? h(Button, { variant: 'ghost', icon: 'check', onClick: p.onReview }, T('See my answers', 'شاهد إجاباتي')) : h(Button, { variant: 'ghost', icon: 'retry', onClick: p.onReplay }, T('Play again', 'العب مرة أخرى')),
        h(Button, { size: 'lg', iconEnd: 'arrowRight', onClick: p.onNext }, p.nextLabel || (p.score != null ? T('Back home', 'إلى الرئيسية') : T('Next lesson', 'الدرس التالي'))))));
  }

  /* ---------- AnswerReviewScreen ---------- */
  var REVIEW_ANS_EN = [
    { n: 1, text: 'Which is bigger: a half or a quarter?', yours: 'A half', right: true },
    { n: 2, text: 'Two quarters make a half.', yours: 'False', correct: 'True', right: false, why: 'Put 2 quarters of a pizza together and you get half the pizza.' },
    { n: 3, text: 'Half of 12 is…', yours: '6', right: true }
  ];
  function AnswerReviewScreen(p) {
    var T = tr(p.lang), N = nr(p.lang), list = p.answers || REVIEW_ANS_EN;
    return Screen(p, 'ek-screen--question', [
      h('header', { key: 'h', className: 'ek-lessonhead' }, h(Button, { variant: 'ghost', icon: 'arrowLeft', label: T('Back', 'رجوع'), onClick: p.onBack }),
        h('div', null, h('span', { className: 'ek-kicker' }, p.title || T('Fractions quiz', 'اختبار الكسور')), h('h1', { className: 'ek-pagehead__title' }, T('My answers', 'إجاباتي')))),
      list.map(function (x) {
        return h('article', { key: x.n, className: cx('ek-answer', x.right ? 'is-right' : 'is-not') },
          h('header', { className: 'ek-answer__head' }, h('strong', null, N(x.n) + '. ' + x.text), h('span', { className: cx('ek-mini', x.right ? 'is-right' : 'is-not') }, h(Icon, { name: x.right ? 'check' : 'retry' }), x.right ? T('Right', 'صحيحة') : T('Not yet', 'ليس بعد'))),
          h('p', null, h('b', null, T('Your answer: ', 'إجابتك: ')), x.yours),
          x.correct && h('p', null, h('b', null, T('Right answer: ', 'الإجابة الصحيحة: ')), x.correct),
          x.why && h('p', { className: 'ek-why' }, h(Icon, { name: 'hint' }), x.why),
          !x.right && h('div', null, h(Button, { variant: 'sun', size: 'sm', icon: 'message', onClick: p.onTutor }, T('Ask Enara about this', 'اسأل إنارة عن هذا'))));
      }),
      h('footer', { key: 'f', className: 'ek-screen__actions' }, h(Button, { size: 'lg', onClick: p.onDone }, T('Back home', 'إلى الرئيسية')))
    ]);
  }

  /* ---------- AllDoneScreen (shared-link quiz finished) ---------- */
  function AllDoneScreen(p) {
    var T = tr(p.lang);
    return Screen(p, 'ek-screen--reward', h('div', { className: 'ek-reward' },
      h('span', { className: 'ek-bigicon ek-bigicon--leaf' }, h(Icon, { name: 'check', size: 44 })),
      h('h2', { className: 'ek-reward__title' }, T('All done!', 'انتهيت!')),
      h('p', { className: 'ek-reward__message' }, T('Thank you! Your answers were sent to your teacher.', 'شكرًا! أُرسلت إجاباتك إلى معلّمك.')),
      h(Cheer, { moment: 'checkDone', lang: p.lang }),
      h(Button, { size: 'lg', onClick: p.onClose }, T('Finish', 'إنهاء'))));
  }

  /* ---------- QuestionScreen (one question with feedback) ---------- */
  var SAMPLE_Q = {
    en: { question: 'Which number is bigger?', prompt: 'Look at each number carefully. Which one is the biggest?', choices: [{ id: 'a', text: '12' }, { id: 'b', text: '21' }, { id: 'c', text: '35' }, { id: 'd', text: '8' }], answer: 'c', hint: '35 has 3 tens. That is more tens than the others!', praise: 'You found the biggest number.' },
    ar: { question: 'أي عدد أكبر؟', prompt: 'انظر إلى كل عدد جيدًا. أيّها الأكبر؟', choices: [{ id: 'a', text: '١٢' }, { id: 'b', text: '٢١' }, { id: 'c', text: '٣٥' }, { id: 'd', text: '٨' }], answer: 'c', hint: 'العدد ٣٥ فيه ٣ عشرات، وهذا أكثر من غيره!', praise: 'لقد وجدت العدد الأكبر.' }
  };
  function QuestionScreen(p) {
    var T = tr(p.lang), q = Object.assign({}, SAMPLE_Q[isAr(p.lang) ? 'ar' : 'en'], p);
    var s = useState(null), sel = s[0], setSel = s[1];
    var r = useState(null), result = r[0], setResult = r[1];
    var t = useState(0), tries = t[0], setTries = t[1];
    var hs = useState(false), showHint = hs[0], setHint = hs[1];
    function check() { var ok = sel === q.answer; setResult(ok ? 'correct' : 'tryagain'); setTries(tries + 1); if (p.onAnswer) p.onAnswer(sel, ok); }
    function retry() { setResult(null); setSel(null); }
    return Screen(Object.assign({}, p, { ariaLabel: q.question }), 'ek-screen--question', [
      h('header', { key: 'h', className: 'ek-screen__top' },
        h(Button, { variant: 'ghost', icon: 'close', label: T('Close lesson', 'إغلاق الدرس'), onClick: p.onExit }),
        h(ProgressTrail, { total: p.total || 6, current: p.step == null ? 3 : p.step, lang: p.lang, className: 'ek-screen__trail' })),
      h(TutorBubble, { key: 't', lang: p.lang, onReadAloud: p.onReadAloud || function () {} }, (showHint || (result === 'tryagain' && tries > 1)) && q.hint ? q.hint : q.prompt),
      h('h2', { key: 'q', className: 'ek-screen__question' }, q.question),
      h(ChoiceGroup, { key: 'c', label: q.question, choices: q.choices, value: sel, lang: p.lang, onChange: function (v) { if (!result) setSel(v); }, status: result, locked: !!result, columns: p.columns }),
      result === 'correct' && p.streak >= 3 ? h(Cheer, { key: 'st', moment: 'streak', n: p.streak, lang: p.lang, seed: p.streak, icon: 'flame' }) : null,
      result ? h(FeedbackBar, { key: 'f', status: result, lang: p.lang, seed: q.question + tries,
        title: result === 'correct' && tries > 1 ? cheer('correctAfterTry', p.lang, q.question) : null,
        message: result === 'correct' ? q.praise : (tries > 1 ? T('Read the hint, then pick again.', 'اقرأ التلميح، ثم اختر من جديد.') : null),
        onContinue: p.onComplete, onRetry: retry })
        : h('footer', { key: 'a', className: 'ek-screen__actions' },
          q.hint ? h(Button, { variant: 'sun', icon: 'hint', onClick: function () { setHint(true); } }, T('Hint', 'تلميح')) : null,
          h(Button, { variant: 'leaf', size: 'lg', disabled: !sel, onClick: check }, T('Check', 'تحقّق')))
    ]);
  }


export { digits, starsFor, LEVELS, PRAISE, cheer, isKidsStudent, Cheer, Icon, Button, AnswerChoice, ChoiceGroup, AnswerInput, ProgressTrail, FeedbackBar, TutorBubble, Sticker, StarRating, SkillBadge, StatusChip, LessonCard, StateMessage, TaskCard, TimerBar, Sheet, WeekDots, ChatComposer, TourCard, AppShell, SignInScreen, SetPasswordScreen, HomeScreen, QuickReviewScreen, CoursesScreen, LessonMap, LessonScreen, TutorScreen, ProgressScreen, QuickCheckScreen, AssignmentsScreen, AssignmentScreen, WorkScreen, SpeakingScreen, PlanScreen, QuizzesScreen, ResultsScreen, RewardSheet, AnswerReviewScreen, AllDoneScreen, QuestionScreen };
