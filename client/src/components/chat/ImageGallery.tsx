/**
 * Image gallery — grid of images from web search.
 */

import React from 'react';
import { Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ImageItem } from '@/services/api';
import type { ThemeColors } from '@/contexts';

interface ImageGalleryProps {
  images: ImageItem[];
  colors: ThemeColors;
  onLinkPress?: (url: string) => void;
}

export function ImageGallery({ images, colors, onLinkPress }: ImageGalleryProps) {
  if (!images?.length) return null;

  const openLink = (url: string) => {
    if (onLinkPress) {
      onLinkPress(url);
    } else {
      Linking.openURL(url).catch(() => {});
    }
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.textSecondary }]}>Images</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {images.slice(0, 12).map((img, i) => (
          <TouchableOpacity
            key={`${img.imageUrl}-${i}`}
            style={[styles.imageWrapper, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}
            activeOpacity={0.85}
            onPress={() => (img.link ? openLink(img.link) : openLink(img.imageUrl))}
          >
            <Image source={{ uri: img.imageUrl }} style={styles.image} resizeMode="cover" />
            {img.title ? (
              <Text style={[styles.caption, { color: colors.textSecondary }]} numberOfLines={2}>
                {img.title}
              </Text>
            ) : null}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 4, gap: 8 },
  title: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
  scroll: { gap: 12, paddingRight: 8 },
  imageWrapper: { width: 140, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  image: { width: 140, height: 110 },
  caption: { fontSize: 11, padding: 8, lineHeight: 14 },
});
