import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import type { ThemeColors } from '@/contexts';

export const GENZ_THINKING_PHRASES = [
    'hold up...',
    'let me cook...',
    'one sec bestie...',
    'lowkey thinking...',
    'getting the tea...',
    'loading the vibes...',
    'ok ok processing...',
    'give me a sec...',
    'brb manifesting...',
    'this is giving loading...',
];

export function BlinkingCursor() {
    const opacity = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        const blink = Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
            ])
        );
        blink.start();
        return () => blink.stop();
    }, [opacity]);
    // @ts-ignore
    return <Animated.Text style={[{ fontSize: 15, color: '#A1A1AA', lineHeight: 24 }, { opacity }]}>{'▋'}</Animated.Text>;
}

export function GenZThinkingIndicator({ colors }: { colors: ThemeColors }) {
    const [phraseIndex, setPhraseIndex] = useState(0);
    const [displayedLength, setDisplayedLength] = useState(0);
    const phrase = GENZ_THINKING_PHRASES[phraseIndex % GENZ_THINKING_PHRASES.length];
    const displayed = phrase.slice(0, displayedLength);

    useEffect(() => {
        if (displayedLength < phrase.length) {
            const t = setTimeout(() => setDisplayedLength((n) => n + 1), 80);
            return () => clearTimeout(t);
        }
        const pauseThenNext = setTimeout(() => {
            setPhraseIndex((i) => i + 1);
            setDisplayedLength(0);
        }, 1200);
        return () => clearTimeout(pauseThenNext);
    }, [phrase, displayedLength, phrase.length]);

    return (
        <View style={styles.genzThinkingRow}>
            <Text style={[styles.genzThinkingText, { color: colors.textSecondary }]}>{displayed}</Text>
            <BlinkingCursor />
        </View>
    );
}

const styles = StyleSheet.create({
    genzThinkingRow: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 8 },
    genzThinkingText: { fontSize: 15, lineHeight: 24, fontStyle: 'italic' },
});
