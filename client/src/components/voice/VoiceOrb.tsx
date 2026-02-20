/**
 * VoiceOrb — Clean, minimal animated gradient sphere with ripple effect.
 *
 * Just a beautiful gradient orb that breathes and emits soft color ripples.
 * No blobs, no shadows — pure and aesthetic.
 *
 * Visual states:
 *   idle        → calm, slow breathing
 *   connecting  → gentle pulsing
 *   listening   → expanding ripples outward
 *   speaking    → faster ripples, energetic breathing
 */

import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
    Easing,
    interpolate,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
    cancelAnimation,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type OrbState = 'idle' | 'connecting' | 'listening' | 'speaking';

interface VoiceOrbProps {
    state: OrbState;
    size?: number;
    isDark?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Palettes                                                           */
/* ------------------------------------------------------------------ */

interface Palette {
    gradA: string;   // center
    gradB: string;   // mid
    gradC: string;   // edge
    ripple: string;  // ripple ring color
}

const DarkPalette: Palette = {
    gradA: '#C4B5FD',   // Soft lavender center
    gradB: '#8B5CF6',   // Vivid purple
    gradC: '#5B21B6',   // Deep purple edge
    ripple: '#A78BFA',  // Lavender ripple
};

const LightPalette: Palette = {
    gradA: '#DDD6FE',   // Lighter lavender center
    gradB: '#A78BFA',   // Mid purple
    gradC: '#7C3AED',   // Rich purple edge
    ripple: '#8B5CF6',  // Purple ripple
};

/* ------------------------------------------------------------------ */
/*  Ripple ring — expanding circle that fades out                      */
/* ------------------------------------------------------------------ */

function Ripple({
    size,
    delay,
    active,
    color,
    duration = 2400,
}: {
    size: number;
    delay: number;
    active: boolean;
    color: string;
    duration?: number;
}) {
    const progress = useSharedValue(0);

    useEffect(() => {
        cancelAnimation(progress);
        if (active) {
            progress.value = 0;
            progress.value = withDelay(
                delay,
                withRepeat(
                    withTiming(1, { duration, easing: Easing.out(Easing.quad) }),
                    -1,
                    false,
                ),
            );
        } else {
            progress.value = withTiming(0, { duration: 500 });
        }
    }, [active, delay, duration, progress]);

    const animStyle = useAnimatedStyle(() => ({
        opacity: interpolate(progress.value, [0, 0.3, 1], [0.5, 0.3, 0]),
        transform: [
            { scale: interpolate(progress.value, [0, 1], [1, 2.2]) },
        ],
    }));

    return (
        <Animated.View
            style={[
                {
                    position: 'absolute',
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    borderWidth: 1.5,
                    borderColor: color,
                },
                animStyle,
            ]}
        />
    );
}

/* ------------------------------------------------------------------ */
/*  Main VoiceOrb                                                      */
/* ------------------------------------------------------------------ */

const ORB_SIZE = 140;

export function VoiceOrb({ state, size = ORB_SIZE, isDark = true }: VoiceOrbProps) {
    const P = isDark ? DarkPalette : LightPalette;

    const breathe = useSharedValue(0);
    const orbScale = useSharedValue(1);

    const isActive = state === 'listening' || state === 'speaking';
    const isSpeaking = state === 'speaking';
    const isListening = state === 'listening';
    const showRipples = isActive;

    useEffect(() => {
        cancelAnimation(breathe);

        switch (state) {
            case 'idle':
                breathe.value = withRepeat(
                    withSequence(
                        withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.sin) }),
                        withTiming(0, { duration: 3000, easing: Easing.inOut(Easing.sin) }),
                    ),
                    -1, false,
                );
                orbScale.value = withSpring(1, { damping: 14, stiffness: 90 });
                break;
            case 'connecting':
                breathe.value = withRepeat(
                    withSequence(
                        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
                        withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
                    ),
                    -1, false,
                );
                orbScale.value = withSpring(1, { damping: 12, stiffness: 100 });
                break;
            case 'listening':
                breathe.value = withRepeat(
                    withSequence(
                        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.sin) }),
                        withTiming(0, { duration: 1000, easing: Easing.inOut(Easing.sin) }),
                    ),
                    -1, false,
                );
                orbScale.value = withSpring(1.05, { damping: 10, stiffness: 80 });
                break;
            case 'speaking':
                breathe.value = withRepeat(
                    withSequence(
                        withTiming(1, { duration: 450, easing: Easing.inOut(Easing.sin) }),
                        withTiming(0.3, { duration: 350, easing: Easing.inOut(Easing.sin) }),
                        withTiming(0.85, { duration: 400, easing: Easing.inOut(Easing.sin) }),
                        withTiming(0, { duration: 400, easing: Easing.inOut(Easing.sin) }),
                    ),
                    -1, false,
                );
                orbScale.value = withSpring(1.08, { damping: 8, stiffness: 70 });
                break;
        }
    }, [state, breathe, orbScale]);

    // Orb breathing + scale
    const orbStyle = useAnimatedStyle(() => {
        const s = interpolate(breathe.value, [0, 1], [0.97, 1.03]) * orbScale.value;
        return {
            transform: [{ scale: s }],
        };
    });

    const containerSize = size * 2.5; // room for ripples
    const half = size / 2;
    const rippleDuration = isSpeaking ? 1800 : 2400;

    return (
        <View style={[styles.container, { width: containerSize, height: containerSize }]}>
            {/* Ripple rings */}
            {showRipples && (
                <>
                    <Ripple size={size} delay={0} active color={P.ripple} duration={rippleDuration} />
                    <Ripple size={size} delay={rippleDuration / 3} active color={P.ripple} duration={rippleDuration} />
                    <Ripple size={size} delay={(rippleDuration / 3) * 2} active color={P.ripple} duration={rippleDuration} />
                </>
            )}

            {/* The orb */}
            <Animated.View
                style={[
                    {
                        width: size,
                        height: size,
                        borderRadius: half,
                        overflow: 'hidden',
                    },
                    orbStyle,
                ]}
            >
                <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                    <Defs>
                        <RadialGradient id="orbGrad" cx="40%" cy="35%" r="60%">
                            <Stop offset="0%" stopColor={P.gradA} />
                            <Stop offset="55%" stopColor={P.gradB} />
                            <Stop offset="100%" stopColor={P.gradC} />
                        </RadialGradient>
                    </Defs>
                    <Circle cx={half} cy={half} r={half} fill="url(#orbGrad)" />
                </Svg>
            </Animated.View>
        </View>
    );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
    },
});
