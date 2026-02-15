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
  { id: 'genz', name: 'GenZ Assistant', description: 'Your cool Gen Z buddy — slangs, confident, real talk', iconName: 'bot' },
  { id: 'coder', name: 'Code Assistant', description: 'Write & debug code', iconName: 'code' },
  { id: 'writer', name: 'Creative Writer', description: 'Stories, poems & essays', iconName: 'pen' },
  { id: 'image', name: 'Image Generator', description: 'Create images from text', iconName: 'image' },
  { id: 'brain', name: 'Research Analyst', description: 'Deep research & analysis', iconName: 'brain' },
  { id: 'web', name: 'Web Browser', description: 'Search & browse the web', iconName: 'globe' },
  { id: 'general', name: 'General Assistant', description: 'All-purpose AI helper', iconName: 'bot' },
];

export const AGENT_ICON_COLORS: Record<string, string> = {
  genz: '#A855F7',
  code: '#6C63FF',
  pen: '#F59E0B',
  image: '#EC4899',
  brain: '#22C55E',
  globe: '#3B82F6',
  bot: '#8B5CF6',
};

/** Tools that can be assigned to a custom agent */
export const DEFAULT_TOOLS = [
  { id: 'web_search', label: 'Web search', description: 'Search the internet for up-to-date information' },
  { id: 'code_exec', label: 'Code execution', description: 'Run code snippets in a sandbox' },
  { id: 'image_gen', label: 'Image generation', description: 'Generate images from text prompts' },
  { id: 'file_read', label: 'Read files', description: 'Read and summarize uploaded files' },
  { id: 'calculator', label: 'Calculator', description: 'Math and unit conversions' },
  { id: 'memory', label: 'Memory', description: 'Remember context across conversations' },
] as const;
