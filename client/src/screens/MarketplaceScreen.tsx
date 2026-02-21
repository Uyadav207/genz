import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Download, Bot, Compass, User } from 'lucide-react-native';

import { ScreenWrapper } from '@/components/common';
import { api } from '@/services/api';
import { useTheme, useAuth } from '@/contexts';
import { Spacing } from '@/constants';
import type { MarketplaceListing, MarketplaceStackParamList } from '@/types';

type NavProp = NativeStackNavigationProp<MarketplaceStackParamList, 'MarketplaceList'>;

export function MarketplaceScreen() {
    const { colors } = useTheme();
    const { accessToken } = useAuth();
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<NavProp>();

    const [listings, setListings] = useState<MarketplaceListing[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const loadListings = useCallback(async () => {
        try {
            const { listings } = await api.listMarketplaceListings(accessToken ?? undefined);
            setListings(listings || []);
        } catch (e) {
            console.error(e);
            setListings([]);
        }
    }, [accessToken]);

    useFocusEffect(
        useCallback(() => {
            setLoading(true);
            loadListings().finally(() => setLoading(false));
        }, [loadListings])
    );

    const onRefresh = async () => {
        setRefreshing(true);
        await loadListings();
        setRefreshing(false);
    };

    const renderItem = ({ item }: { item: MarketplaceListing }) => {
        return (
            <TouchableOpacity
                style={[styles.card, { backgroundColor: '#FFFFFF', borderColor: colors.border }]}
                onPress={() => navigation.navigate('MarketplaceDetail', { listingId: item.id })}
                activeOpacity={0.7}
            >
                <View style={styles.cardHeader}>
                    <View style={[styles.iconWrap, { backgroundColor: colors.surface }]}>
                        <Bot size={24} color={colors.primary} />
                    </View>
                    <View style={styles.titleWrap}>
                        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                            {item.title}
                        </Text>
                        <View style={styles.authorRow}>
                            <User size={12} color={colors.textSecondary} />
                            <Text style={[styles.authorName, { color: colors.textSecondary }]}>
                                {item.publisher_name || 'Anonymous'}
                            </Text>
                        </View>
                    </View>
                    <View style={styles.priceWrap}>
                        <Text style={[styles.priceTag, { color: colors.primary, backgroundColor: colors.surface }]}>
                            {item.price_cents > 0 ? `$${(item.price_cents / 100).toFixed(2)}` : 'Free'}
                        </Text>
                    </View>
                </View>

                <Text style={[styles.summary, { color: colors.textSecondary }]} numberOfLines={2}>
                    {item.summary || item.agent_description || 'No description available.'}
                </Text>

                <View style={styles.cardFooter}>
                    <View style={styles.stat}>
                        <Download size={14} color={colors.textSecondary} />
                        <Text style={[styles.statText, { color: colors.textSecondary }]}>{item.download_count}</Text>
                    </View>
                    {item.downloaded && (
                        <View style={[styles.downloadedBadge, { backgroundColor: colors.border }]}>
                            <Text style={[styles.downloadedText, { color: colors.textSecondary }]}>In library</Text>
                        </View>
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <ScreenWrapper style={styles.wrapper} padded={false}>
            <View style={[styles.header, { paddingTop: insets.top, borderBottomColor: colors.border }]}>
                <Compass size={24} color={colors.primary} style={{ marginRight: 8 }} />
                <Text style={[styles.headerTitle, { color: colors.text }]}>Marketplace</Text>
                <TouchableOpacity
                    style={styles.myListingsBtn}
                    onPress={() => navigation.navigate('MyListings')}
                >
                    <Text style={[styles.myListingsText, { color: colors.primary }]}>My Listings</Text>
                </TouchableOpacity>
            </View>

            {loading && !refreshing ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={listings}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <Bot size={48} color={colors.border} />
                            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                                No agents published yet.
                            </Text>
                        </View>
                    }
                />
            )}
        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    wrapper: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        paddingVertical: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerTitle: { fontSize: 22, fontWeight: '700', flex: 1 },
    myListingsBtn: { padding: Spacing.sm },
    myListingsText: { fontSize: 14, fontWeight: '600' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
    listContent: { padding: Spacing.md, gap: Spacing.md },
    card: {
        padding: Spacing.md,
        borderRadius: 16,
        borderWidth: 1,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        marginBottom: Spacing.sm,
    },
    iconWrap: {
        width: 48,
        height: 48,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    titleWrap: { flex: 1 },
    title: { fontSize: 17, fontWeight: '600', marginBottom: 2 },
    authorRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    authorName: { fontSize: 13, fontWeight: '500' },
    priceWrap: { justifyContent: 'flex-start', alignItems: 'flex-end' },
    priceTag: {
        fontSize: 12,
        fontWeight: '700',
        overflow: 'hidden',
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    summary: { fontSize: 14, lineHeight: 20, marginBottom: Spacing.md },
    cardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(0,0,0,0.05)',
        paddingTop: Spacing.sm,
    },
    stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    statText: { fontSize: 13, fontWeight: '500' },
    downloadedBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    downloadedText: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
    emptyText: { marginTop: Spacing.md, fontSize: 15 },
});
