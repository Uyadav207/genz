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
        {images.slice(0, 8).map((img, i) => (
          <TouchableOpacity
            key={`${img.imageUrl}-${i}`}
            style={[styles.imageWrapper, { borderColor: colors.border }]}
            activeOpacity={0.8}
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
  container: { marginTop: 12, gap: 8 },
  title: { fontSize: 13, fontWeight: '600' },
  scroll: { gap: 10, paddingRight: 8 },
  imageWrapper: { width: 120, borderRadius: 8, borderWidth: 1, overflow: 'hidden' },
  image: { width: 120, height: 90 },
  caption: { fontSize: 11, padding: 6 },
});
