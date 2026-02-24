import React from 'react';
import { Text } from 'react-native';
import { Code, PenLine, ImageIcon, BrainCircuit, Globe, Sparkles, User } from 'lucide-react-native';
import { AGENT_ICON_COLORS } from '@/constants';

export const EMOJI_PREFIX = 'emoji:';

export function AgentIcon({ name, size = 22, color: colorOverride }: { name: string; size?: number; color?: string }) {
    const color = colorOverride ?? (AGENT_ICON_COLORS[name] || '#B57EDC');
    switch (name) {
        case 'genz': return <Sparkles size={size} color={color} />;
        case 'code': return <Code size={size} color={color} />;
        case 'pen': return <PenLine size={size} color={color} />;
        case 'image': return <ImageIcon size={size} color={color} />;
        case 'brain': return <BrainCircuit size={size} color={color} />;
        case 'globe': return <Globe size={size} color={color} />;
        case 'bot':
        case 'user':
        default: return <User size={size} color={color} />;
    }
}

/** Renders agent icon (Lucide) or emoji when iconName is "emoji:😀". */
export function AgentIconOrEmoji({ iconName, size = 32, color }: { iconName: string; size?: number; color?: string }) {
    if (iconName.startsWith(EMOJI_PREFIX)) {
        return <Text style={{ fontSize: size }}>{iconName.slice(EMOJI_PREFIX.length)}</Text>;
    }
    return <AgentIcon name={iconName} size={size} color={color} />;
}
