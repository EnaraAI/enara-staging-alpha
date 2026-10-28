import { LiveAvatar, AvatarConfig, AvatarStreamAnalytics } from '../types';
import { MOCK_AVATARS, DEFAULT_AVATAR_CONFIG, MOCK_AVATAR_ANALYTICS } from '../constants';


export const fetchAvatarsList = async (): Promise<LiveAvatar[]> => {
  const localSaved = localStorage.getItem('enara_avatars_list');
  if (localSaved) {
    try { return JSON.parse(localSaved); } catch (e) {}
  }
  return MOCK_AVATARS;
};

export const fetchAvatarConfig = async (): Promise<AvatarConfig> => {
  const localConfig = localStorage.getItem('enara_avatar_config');
  if (localConfig) {
    try { return JSON.parse(localConfig); } catch (e) {}
  }
  return DEFAULT_AVATAR_CONFIG;
};

export const saveAvatarConfig = async (config: Partial<AvatarConfig>): Promise<{ success: boolean; config?: AvatarConfig; message?: string }> => {
  const existing = await fetchAvatarConfig();
  const updated = { ...existing, ...config };
  localStorage.setItem('enara_avatar_config', JSON.stringify(updated));
  return { success: true, config: updated, message: 'Configuration saved.' };
};

export const saveAdminAvatar = async (avatar: Partial<LiveAvatar>): Promise<{ success: boolean; avatar?: LiveAvatar }> => {
  const current = await fetchAvatarsList();
  const newAvatar: LiveAvatar = {
    id: avatar.id || `av-${Date.now().toString().slice(-4)}`,
    name: avatar.name || 'New Avatar',
    title: avatar.title || 'Specialist Tutor',
    subject: avatar.subject || 'General Education',
    provider: avatar.provider || 'enara-webrtc',
    avatarModelId: avatar.avatarModelId || 'laura',
    voiceId: avatar.voiceId || 'en-US-JennyNeural',
    avatarUrl: avatar.avatarUrl || 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=600',
    accent: avatar.accent || 'Clear Academic',
    personalityPrompt: avatar.personalityPrompt || 'Supportive tutor.',
    isActive: avatar.isActive ?? true,
    tags: avatar.tags || ['Custom'],
    streamingQuality: avatar.streamingQuality || '1080p',
    latencyMs: 170,
    totalSessions: 0,
    rating: 5.0,
    gender: avatar.gender || 'neutral'
  };

  const existingIdx = current.findIndex(a => a.id === newAvatar.id);
  if (existingIdx >= 0) {
    current[existingIdx] = newAvatar;
  } else {
    current.unshift(newAvatar);
  }

  localStorage.setItem('enara_avatars_list', JSON.stringify(current));
  return { success: true, avatar: newAvatar };
};

export const toggleAvatarActiveStatus = async (avatarId: string, isActive: boolean): Promise<boolean> => {
  const current = await fetchAvatarsList();
  const avatar = current.find(a => a.id === avatarId);
  if (avatar) {
    avatar.isActive = isActive;
    localStorage.setItem('enara_avatars_list', JSON.stringify(current));
    return true;
  }
  return false;
};

// Sample analytics until stream sessions are recorded on the backend.
export const fetchAvatarAnalytics = async (): Promise<AvatarStreamAnalytics> => {
  return MOCK_AVATAR_ANALYTICS;
};
