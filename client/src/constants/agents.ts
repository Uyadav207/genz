/**
 * Shared agent and tool definitions for Agents screen and Chat.
 */

export interface AgentDef {
  id: string;
  name: string;
  description: string;
  iconName: string;
}

/** Default agent used for chat when none is selected (GenZ Assistant). */
export const DEFAULT_AGENT_ID = 'genz';

export const DEFAULT_AGENTS: AgentDef[] = [
  { id: 'genz', name: 'GenZ Assistant', description: 'Your cool Gen Z buddy — slangs, confident, real talk', iconName: 'genz' },
  { id: 'coder', name: 'Code Assistant', description: 'Write & debug code', iconName: 'code' },
  { id: 'writer', name: 'Creative Writer', description: 'Stories, poems & essays', iconName: 'pen' },
  { id: 'image', name: 'Image Generator', description: 'Create images from text', iconName: 'image' },
  { id: 'brain', name: 'Research Analyst', description: 'Deep research & analysis', iconName: 'brain' },
  { id: 'web', name: 'Web Browser', description: 'Search & browse the web', iconName: 'globe' },
  { id: 'general', name: 'General Assistant', description: 'All-purpose AI helper', iconName: 'bot' },
];

export const AGENT_ICON_COLORS: Record<string, string> = {
  genz: '#B57EDC',
  code: '#1E1E1E',
  pen: '#F0A8D0',
  image: '#FF8EC7',
  brain: '#F59E0B',
  globe: '#7DD3FC',
  bot: '#CDA4F0',
};

/** Personalized empty-state greeting per default agent (no action cards). Custom agents use agent name + generic line. */
export const AGENT_EMPTY_GREETING: Record<string, string> = {
  coder: "I'm your Code Assistant — what would you like to build or debug today?",
  writer: "I'm your Creative Writer — ready to help with stories, poems, or essays. What's on your mind?",
  image: "I'm your Image Generator — describe what you'd like to see and I'll create it.",
  brain: "I'm your Research Analyst — drop a topic and I'll dig deep for you.",
  web: "I'm your Web Browser — ask me to search or look up anything.",
};

/** Agent ids that show the 4 action cards (diet plan, joke, etc.) in empty state; others show personalized greeting only. */
export const AGENTS_WITH_ACTION_CARDS = ['genz', 'general'];

/** Prefix for custom agent icon when stored as emoji (icon_name = "emoji:🔥"). */
export const EMOJI_ICON_PREFIX = 'emoji:';

/** Emoji options for custom agent icon picker. */
export const AGENT_EMOJI_OPTIONS = [
  '🤖', '🧠', '✨', '🔥', '💡', '📝', '🎨', '🔍', '🌐', '📚',
  '💼', '🎯', '🚀', '⚡', '🎭', '🛠️', '📊', '💬', '🌟', '🎪',
  '🔬', '📖', '🖌️', '🎵', '🏆', '💎', '🌍', '🦉', '🐱', '🦊',
];

/** Skills that can be assigned to a custom agent */
export const DEFAULT_SKILLS = [
  { id: 'web_search', label: 'Web Search', description: 'Search the internet for up-to-date information' },
  { id: 'memory', label: 'Memory', description: 'Remember context across conversations' },
  { id: 'knowledge_base', label: 'Knowledge Base', description: 'Upload documents to give your agent permanent knowledge (RAG)' },
  { id: 'image_generation', label: 'Image Generation', description: 'Generate images from text descriptions using AI' },
] as const;
