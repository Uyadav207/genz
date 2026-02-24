import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { ImageIcon } from 'lucide-react-native';
import type { ThemeColors } from '@/contexts';

export function ImageGeneratingPlaceholder({ colors }: { colors: ThemeColors }) {
    const shimmer = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const anim = Animated.loop(
            Animated.sequence([
                Animated.timing(shimmer, { toValue: 1, duration: 1500, useNativeDriver: true }),
                Animated.timing(shimmer, { toValue: 0, duration: 1500, useNativeDriver: true }),
            ])
        );
        anim.start();
        return () => anim.stop();
    }, [shimmer]);

    const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });

    return (
        <View style={imgPlaceholderStyles.container}>
            <View style={[imgPlaceholderStyles.canvas, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                <Animated.View style={[imgPlaceholderStyles.shimmerOverlay, { opacity, backgroundColor: colors.border }]} />
                <View style={imgPlaceholderStyles.iconContainer}>
                    <ImageIcon size={36} color={colors.textSecondary} strokeWidth={1.5} />
                </View>
                <Text style={[imgPlaceholderStyles.label, { color: colors.textSecondary }]}>Creating your image…</Text>
            </View>
        </View>
    );
}

export const imgPlaceholderStyles = StyleSheet.create({
    container: { marginTop: 4, width: '100%' },
    canvas: {
        width: '100%',
        aspectRatio: 1,
        borderRadius: 16,
        borderWidth: 1,
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    shimmerOverlay: {
        ...StyleSheet.absoluteFillObject,
    },
    iconContainer: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: 'rgba(128,128,128,0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    label: { fontSize: 14, fontWeight: '500' },
});
