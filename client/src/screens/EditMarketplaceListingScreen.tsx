import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenWrapper } from '@/components/common';
import { api } from '@/services/api';
import { useTheme, useAuth } from '@/contexts';
import { Spacing, FontSize } from '@/constants';
import type { MarketplaceListing, MarketplaceStackParamList } from '@/types';

type EditRouteProp = RouteProp<MarketplaceStackParamList, 'EditListing'>;
type NavProp = NativeStackNavigationProp<MarketplaceStackParamList>;

export function EditMarketplaceListingScreen() {
    const { colors } = useTheme();
    const { accessToken } = useAuth();
    const route = useRoute<EditRouteProp>();
    const navigation = useNavigation<NavProp>();
    const insets = useSafeAreaInsets();

    const [loading, setLoading] = useState(true);
    const [listing, setListing] = useState<MarketplaceListing | null>(null);

    const [title, setTitle] = useState('');
    const [summary, setSummary] = useState('');
    const [category, setCategory] = useState('');
    const [price, setPrice] = useState('0');
    const [status, setStatus] = useState<'active' | 'archived'>('active');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const fetchListing = async () => {
            try {
                const { listing: l } = await api.getMarketplaceListing(route.params.listingId, accessToken ?? undefined);
                setListing(l);
                setTitle(l.title);
                setSummary(l.summary || '');
                setCategory(l.category || '');
                setPrice((l.price_cents / 100).toFixed(2).replace(/\.00$/, ''));
                setStatus(l.status as any);
            } catch (e) {
                Alert.alert('Error', 'Failed to load listing for editing.');
                console.error(e);
                navigation.goBack();
            } finally {
                setLoading(false);
            }
        };
        fetchListing();
    }, [route.params.listingId, accessToken, navigation]);

    const handleUpdate = async () => {
        if (!title.trim()) {
            Alert.alert('Validation Error', 'Title is required');
            return;
        }
        if (!accessToken) return;

        setSubmitting(true);
        try {
            await api.updateMarketplaceListing(
                route.params.listingId,
                {
                    title: title.trim(),
                    summary: summary.trim(),
                    category: category.trim() || 'General',
                    price_cents: parseFloat(price) ? Math.floor(parseFloat(price) * 100) : 0,
                    status,
                },
                accessToken
            );

            Alert.alert('Success', 'Listing updated successfully!');
            navigation.goBack();
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Failed to update listing');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <ScreenWrapper style={{ flex: 1, justifyContent: 'center' }} padded={false}>
                <ActivityIndicator size="large" color={colors.primary} />
            </ScreenWrapper>
        );
    }

    return (
        <ScreenWrapper style={styles.wrapper} padded={false}>
            <ScrollView contentContainerStyle={[styles.form, { paddingBottom: insets.bottom + Spacing.xl }]}>
                <Text style={[styles.headerText, { color: colors.text }]}>Edit Listing</Text>

                <View style={styles.field}>
                    <Text style={[styles.label, { color: colors.text }]}>Listing Title *</Text>
                    <TextInput
                        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                        value={title}
                        onChangeText={setTitle}
                        placeholder="e.g. Pro Python Developer"
                        placeholderTextColor={colors.textSecondary}
                    />
                </View>

                <View style={styles.field}>
                    <Text style={[styles.label, { color: colors.text }]}>Summary</Text>
                    <TextInput
                        style={[styles.input, styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                        value={summary}
                        onChangeText={setSummary}
                        placeholder="Describe what your agent is great at..."
                        placeholderTextColor={colors.textSecondary}
                        multiline
                        textAlignVertical="top"
                    />
                </View>

                <View style={styles.field}>
                    <Text style={[styles.label, { color: colors.text }]}>Category</Text>
                    <TextInput
                        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                        value={category}
                        onChangeText={setCategory}
                        placeholder="e.g. Coding, Writing, Productivity"
                        placeholderTextColor={colors.textSecondary}
                    />
                </View>

                <View style={styles.field}>
                    <Text style={[styles.label, { color: colors.text }]}>Price ($)</Text>
                    <TextInput
                        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                        value={price}
                        onChangeText={setPrice}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor={colors.textSecondary}
                    />
                </View>

                <View style={styles.field}>
                    <Text style={[styles.label, { color: colors.text }]}>Status</Text>
                    <View style={styles.statusRow}>
                        <TouchableOpacity
                            style={[styles.statusBox, status === 'active' ? { backgroundColor: colors.primary } : { backgroundColor: colors.border }]}
                            onPress={() => setStatus('active')}
                        >
                            <Text style={[styles.statusText, status === 'active' ? { color: '#fff' } : { color: colors.textSecondary }]}>Active</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.statusBox, status === 'archived' ? { backgroundColor: '#ef4444' } : { backgroundColor: colors.border }]}
                            onPress={() => setStatus('archived')}
                        >
                            <Text style={[styles.statusText, status === 'archived' ? { color: '#fff' } : { color: colors.textSecondary }]}>Archived (Hidden)</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <TouchableOpacity
                    style={[styles.submitBtn, { backgroundColor: colors.primary }]}
                    onPress={handleUpdate}
                    disabled={submitting}
                >
                    {submitting ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.submitBtnText}>Save Changes</Text>
                    )}
                </TouchableOpacity>
            </ScrollView>
        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    wrapper: { flex: 1 },
    headerText: { fontSize: 22, fontWeight: '700', marginBottom: Spacing.xl },
    form: { padding: Spacing.lg },
    field: { marginBottom: Spacing.lg },
    label: { fontSize: 14, fontWeight: '600', marginBottom: Spacing.sm },
    input: {
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: Spacing.md,
        paddingVertical: 12,
        fontSize: 16,
    },
    textArea: {
        height: 100,
    },
    statusRow: { flexDirection: 'row', gap: Spacing.md },
    statusBox: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
    statusText: { fontSize: 14, fontWeight: '600' },
    submitBtn: {
        height: 52,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: Spacing.xl,
    },
    submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
