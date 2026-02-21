/**
 * Place cards — restaurants, businesses with address, phone, image.
 */

import React from 'react';
import { Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MapPin, Phone, Star } from 'lucide-react-native';
import type { PlaceItem } from '@/services/api';
import type { ThemeColors } from '@/contexts';

interface PlaceCardsProps {
  places: PlaceItem[];
  colors: ThemeColors;
  onLinkPress?: (url: string) => void;
}

export function PlaceCards({ places, colors, onLinkPress }: PlaceCardsProps) {
  if (!places?.length) return null;

  const openLink = (url: string) => {
    if (onLinkPress) {
      onLinkPress(url);
    } else {
      Linking.openURL(url).catch(() => {});
    }
  };

  const openPhone = (phone: string) => {
    Linking.openURL(`tel:${phone.replace(/\D/g, '')}`).catch(() => {});
  };

  const openMaps = (address: string) => {
    const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(address)}`;
    if (onLinkPress) {
      onLinkPress(mapsUrl);
    } else {
      Linking.openURL(mapsUrl).catch(() => {});
    }
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.textSecondary }]}>Places</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {places.slice(0, 8).map((p, i) => (
          <TouchableOpacity
            key={`${p.title}-${i}`}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
            activeOpacity={0.8}
            onPress={() => p.link && openLink(p.link)}
          >
            {p.imageUrl ? (
              <Image source={{ uri: p.imageUrl }} style={styles.image} resizeMode="cover" />
            ) : (
              <View style={[styles.imagePlaceholder, { backgroundColor: colors.surfaceSecondary }]}>
                <MapPin size={24} color={colors.textSecondary} />
              </View>
            )}
            <View style={styles.cardBody}>
              <Text style={[styles.placeTitle, { color: colors.text }]} numberOfLines={1}>
                {p.title}
              </Text>
              {p.rating != null && p.rating > 0 && (
                <View style={styles.ratingRow}>
                  <Star size={14} color="#F59E0B" fill="#F59E0B" />
                  <Text style={[styles.ratingText, { color: colors.textSecondary }]}>
                    {p.rating}
                    {p.reviews != null && p.reviews > 0 && ` (${p.reviews})`}
                  </Text>
                  {p.price && <Text style={[styles.priceText, { color: colors.textSecondary }]}>{p.price}</Text>}
                </View>
              )}
              {p.address && (
                <TouchableOpacity
                  style={styles.infoRow}
                  onPress={() => openMaps(p.address!)}
                  activeOpacity={0.7}
                >
                  <MapPin size={14} color={colors.primary} />
                  <Text style={[styles.infoText, { color: colors.text }]} numberOfLines={1}>
                    {p.address}
                  </Text>
                </TouchableOpacity>
              )}
              {p.phone && (
                <TouchableOpacity
                  style={styles.infoRow}
                  onPress={() => openPhone(p.phone!)}
                  activeOpacity={0.7}
                >
                  <Phone size={14} color={colors.primary} />
                  <Text style={[styles.infoText, { color: colors.primary }]}>{p.phone}</Text>
                </TouchableOpacity>
              )}
            </View>
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
  card: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    width: 280,
    minHeight: 100,
  },
  image: { width: 96, height: 96 },
  imagePlaceholder: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, padding: 10, justifyContent: 'space-between', gap: 4 },
  placeTitle: { fontSize: 15, fontWeight: '600' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ratingText: { fontSize: 13 },
  priceText: { fontSize: 13, marginLeft: 4 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoText: { fontSize: 13, flex: 1 },
});
