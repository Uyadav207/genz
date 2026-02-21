import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Download, Bot, ChevronLeft, User, LibraryBig } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenWrapper } from '@/components/common';
import { api } from '@/services/api';
import { useTheme, useAuth } from '@/contexts';
import { Spacing, FontSize } from '@/constants';
import type { MarketplaceListing, MarketplaceStackParamList, MainTabsParamList } from '@/types';

type DetailRouteProp = RouteProp<MarketplaceStackParamList, 'MarketplaceDetail'>;
type NavigationProp = NativeStackNavigationProp<MarketplaceStackParamList>;

export function MarketplaceDetailScreen() {
    const { colors } = useTheme();
    const { accessToken } = useAuth();
    const route = useRoute<DetailRouteProp>();
    const navigation = useNavigation<NavigationProp>();
    const insets = useSafeAreaInsets();

    const [listing, setListing] = useState<MarketplaceListing | null>(null);
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState(false);

    useEffect(() => {
        const fetchListing = async () => {
            try {
                const { listing } = await api.getMarketplaceListing(route.params.listingId, accessToken ?? undefined);
                setListing(listing);
            } catch (e) {
                Alert.alert('Error', 'Failed to load listing details.');
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchListing();
    }, [route.params.listingId, accessToken]);

    const handleDownload = async () => {
        if (!accessToken) {
            Alert.alert('Sign in Required', 'You must be signed in to download agents.');
            return;
        }
        setDownloading(true);
        try {
            const resp = await api.downloadListing(listing!.id, accessToken);

            Alert.alert('Success', 'Agent added to your library!', [
                {
                    text: 'Go to Agents',
                    onPress: () => {
                        // Need to pop to top then switch tab, but for simplicity:
                        const parent = navigation.getParent();
                        if (parent) {
                            parent.navigate('Agents' as never);
                        }
                    },
                },
                { text: 'OK', style: 'cancel' }
            ]);
            setListing((prev) => prev ? { ...prev, downloaded: true, download_count: prev.download_count + (resp.already_downloaded ? 0 : 1) } : null);
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Failed to download agent');
        } finally {
            setDownloading(false);
        }
    };

    if (loading) {
        return (
            <ScreenWrapper style={styles.center} padded={false}>
                <ActivityIndicator size="large" color={colors.primary} />
            </ScreenWrapper>
        );
    }

    if (!listing) {
        return (
            <ScreenWrapper style={styles.center} padded={false}>
                <Text style={[styles.errorText, { color: colors.textSecondary }]}>Listing not found</Text>
            </ScreenWrapper>
        );
    }

    return (
        <ScreenWrapper style={styles.wrapper} padded={false}>
            <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing.xl }]}>
                <View style={styles.headerArea}>
                    <View style={[styles.mainIconWrap, { backgroundColor: colors.surface }]}>
                        <Bot size={56} color={colors.primary} />
                    </View>
                    <Text style={[styles.title, { color: colors.text }]}>{listing.title}</Text>
                    <View style={styles.authorBadge}>
                        <User size={14} color={colors.textSecondary} />
                        <Text style={[styles.authorName, { color: colors.textSecondary }]}>
                            {listing.publisher_name || 'Anonymous Creator'}
                        </Text>
                    </View>
                </View>

                <View style={styles.statsRow}>
                    <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
                        <Text style={[styles.statValue, { color: colors.text }]}>{listing.download_count}</Text>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Downloads</Text>
                    </View>
                    <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
                        <Text style={[styles.statValue, { color: colors.text }]}>
                            {listing.price_cents > 0 ? `$${(listing.price_cents / 100).toFixed(2)}` : 'Free'}
                        </Text>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Price</Text>
                    </View>
                    <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
                        <Text style={[styles.statValue, { color: colors.text }]}>{listing.category || 'General'}</Text>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Category</Text>
                    </View>
                </View>

                <View style={[styles.section, { borderTopColor: colors.border }]}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>About</Text>
                    <Text style={[styles.description, { color: colors.textSecondary }]}>
                        {listing.summary || listing.agent_description || 'No detailed description provided.'}
                    </Text>
                </View>

                {listing.agent_skill_ids && listing.agent_skill_ids.length > 0 && (
                    <View style={[styles.section, { borderTopColor: colors.border }]}>
                        <Text style={[styles.sectionTitle, { color: colors.text }]}>Capabilities</Text>
                        <View style={styles.skillsList}>
                            {listing.agent_skill_ids.map(skill => (
                                <View key={skill} style={[styles.skillChip, { backgroundColor: colors.border }]}>
                                    <Text style={[styles.skillText, { color: colors.text }]}>{skill}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                )}
            </ScrollView>

            <View style={[styles.actionFooter, { backgroundColor: colors.background, paddingBottom: insets.bottom || Spacing.md, borderTopColor: colors.border }]}>
                {listing.downloaded ? (
                    <View style={[styles.disabledBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <LibraryBig size={20} color={colors.textSecondary} style={{ marginRight: Spacing.sm }} />
                        <Text style={[styles.disabledBtnText, { color: colors.textSecondary }]}>In Your Agents Library</Text>
                    </View>
                ) : (
                    <TouchableOpacity
                        style={[styles.downloadBtn, { backgroundColor: colors.primary }]}
                        onPress={handleDownload}
                        disabled={downloading}
                        activeOpacity={0.8}
                    >
                        {downloading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <>
                                <Download size={20} color="#fff" style={{ marginRight: Spacing.sm }} />
                                <Text style={styles.downloadBtnText}>Add to Library</Text>
                            </>
                        )}
                    </TouchableOpacity>
                )}
            </View>
        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    wrapper: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    errorText: { fontSize: FontSize.md },
    scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl },
    headerArea: { alignItems: 'center', marginBottom: Spacing.xl },
    mainIconWrap: {
        width: 96,
        height: 96,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Spacing.md,
    },
    title: { fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: Spacing.xs },
    authorBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    authorName: { fontSize: 14, fontWeight: '500' },

    statsRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.xl },
    statBox: { flex: 1, padding: Spacing.md, borderRadius: 12, alignItems: 'center' },
    statValue: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
    statLabel: { fontSize: 12 },

    section: { paddingTop: Spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, marginBottom: Spacing.lg },
    sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: Spacing.md },
    description: { fontSize: 15, lineHeight: 22 },

    skillsList: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    skillChip: { paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: 20 },
    skillText: { fontSize: 13, fontWeight: '500' },

    actionFooter: {
        padding: Spacing.md,
        borderTopWidth: StyleSheet.hairlineWidth,
        ...StyleSheet.absoluteFillObject,
        top: undefined,
    },
    downloadBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 16,
    },
    downloadBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    disabledBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 16,
        borderWidth: 1,
    },
    disabledBtnText: { fontSize: 16, fontWeight: '600' },
});
