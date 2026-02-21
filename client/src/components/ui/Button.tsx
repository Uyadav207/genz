/**
 * Reusable Button component.
 */

import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  type TouchableOpacityProps,
  type TextStyle,
  type ViewStyle,
  ActivityIndicator,
} from 'react-native';
import { FontSize, Spacing, BorderRadius } from '@/constants';
import { useTheme } from '@/contexts';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: ButtonVariant;
  loading?: boolean;
  textStyle?: TextStyle;
}

export function Button({
  title,
  variant = 'primary',
  loading = false,
  style,
  textStyle,
  disabled,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const { colors } = useTheme();

  const variantStyles: Record<ButtonVariant, ViewStyle> = {
    primary: { backgroundColor: colors.primary },
    secondary: { backgroundColor: colors.secondary },
    outline: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: colors.primary,
    },
    ghost: { backgroundColor: 'transparent' },
  };

  const variantTextStyles: Record<ButtonVariant, TextStyle> = {
    primary: { color: colors.white },
    secondary: { color: colors.white },
    outline: { color: colors.primary },
    ghost: { color: colors.primary },
  };

  return (
    <TouchableOpacity
      style={[
        styles.base,
        variantStyles[variant],
        isDisabled && styles.disabled,
        style as ViewStyle,
      ]}
      disabled={isDisabled}
      activeOpacity={0.75}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'outline' || variant === 'ghost' ? colors.primary : colors.white}
        />
      ) : (
        <Text style={[styles.text, variantTextStyles[variant], textStyle]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: Spacing.sm + 4,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: FontSize.base,
    fontWeight: '600',
  },
});

