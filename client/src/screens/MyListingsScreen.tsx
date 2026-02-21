import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Bot, Plus, Edit2, Trash2 } from 'lucide-react-native';

import { ScreenWrapper } from '@/components/common';
import { api } from '@/services/api';
import { useTheme, useAuth } from '@/contexts';
import { Spacing } from '@/constants';
import type { MarketplaceListing, MarketplaceStackParamList } from '@/types';

type NavProp = NativeStackNavigationProp<MarketplaceStackParamList, 'MyListings'>;

export function MyListingsScreen() {
    const { colors } = useTheme();
    const { accessToken } = useAuth();
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<NavProp>();

    const [listings, setListings] = useState<MarketplaceListing[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const loadMyListings = useCallback(async () => {
        if (!accessToken) return;
        try {
            const { listings } = await api.getMyListings(accessToken);
            setListings(listings || []);
        } catch (e) {
            console.error(e);
            setListings([]);
        }
    }, [accessToken]);

    useFocusEffect(
        useCallback(() => {
            setLoading(true);
            loadMyListings().finally(() => setLoading(false));
        }, [loadMyListings])
    );

    const onRefresh = async () => {
        setRefreshing(true);
        await loadMyListings();
        setRefreshing(false);
    };

    const handleDelete = (listing: MarketplaceListing) => {
        Alert.alert(
            'Unpublish Listing',
            `Are you sure you want to remove "${listing.title}" from the marketplace?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Unpublish',
                    style: 'destructive',
                    onPress: async () => {
                        if (!accessToken) return;
                        try {
                            await api.deleteMarketplaceListing(listing.id, accessToken);
                            loadMyListings();
                        } catch (e: any) {
                            Alert.alert('Error', e.message || 'Failed to delete listing.');
                        }
                    }
                }
            ]
        );
    };

    const renderItem = ({ item }: { item: MarketplaceListing }) => (
        <View style={[styles.card, { backgroundColor: '#FFFFFF', borderColor: colors.border }]}>
            <View style={styles.cardHeader}>
                <View style={[styles.iconWrap, { backgroundColor: colors.surface }]}>
                    <Bot size={24} color={colors.primary} />
                </View>
                <View style={styles.titleWrap}>
                    <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                        {item.title}
                    </Text>
                    <Text style={[styles.statusText, {
                        color: item.status === 'active' ? '#10B981' : colors.textSecondary
                    }]}>
                        {item.status.toUpperCase()} • {item.download_count} downloads
                    </Text>
                </View>
            </View>

            <Text style={[styles.summary, { color: colors.textSecondary }]} numberOfLines={2}>
                {item.summary || item.agent_description || 'No summary'}
            </Text>

            <View style={[styles.actions, { borderTopColor: colors.border }]}>
                <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => navigation.navigate('EditListing', { listingId: item.id })}
                >
                    <Edit2 size={16} color={colors.primary} style={{ marginRight: 6 }} />
                    <Text style={[styles.actionText, { color: colors.primary }]}>Edit</Text>
                </TouchableOpacity>

                <View style={[styles.divider, { backgroundColor: colors.border }]} />

                <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => handleDelete(item)}
                >
                    <Trash2 size={16} color="#ef4444" style={{ marginRight: 6 }} />
                    <Text style={[styles.actionText, { color: '#ef4444' }]}>Unpublish</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <ScreenWrapper style={styles.wrapper} padded={false}>
            {loading && !refreshing ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={listings}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + Spacing.xl }]}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <Bot size={48} color={colors.border} />
                            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                                You haven't published any agents yet.
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
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
    listContent: { padding: Spacing.md, gap: Spacing.md },
    card: { padding: Spacing.md, borderRadius: 16, borderWidth: 1 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
    iconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    titleWrap: { flex: 1 },
    title: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
    statusText: { fontSize: 12, fontWeight: '500' },
    summary: { fontSize: 13, lineHeight: 18, marginBottom: Spacing.md },
    actions: { flexDirection: 'row', paddingTop: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.sm },
    actionText: { fontSize: 14, fontWeight: '500' },
    divider: { width: StyleSheet.hairlineWidth, height: '100%' },
    emptyText: { marginTop: Spacing.md, fontSize: 15, textAlign: 'center' },
});
