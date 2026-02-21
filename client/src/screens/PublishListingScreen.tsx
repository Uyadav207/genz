import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenWrapper } from '@/components/common';
import { api } from '@/services/api';
import { useTheme, useAuth } from '@/contexts';
import { Spacing } from '@/constants';
import type { MarketplaceStackParamList } from '@/types';

type PublishRouteProp = RouteProp<MarketplaceStackParamList, 'PublishListing'>;
type NavProp = NativeStackNavigationProp<MarketplaceStackParamList>;

export function PublishListingScreen() {
    const { colors } = useTheme();
    const { accessToken } = useAuth();
    const route = useRoute<PublishRouteProp>();
    const navigation = useNavigation<NavProp>();
    const insets = useSafeAreaInsets();

    const [title, setTitle] = useState('');
    const [summary, setSummary] = useState('');
    const [category, setCategory] = useState('');
    const [price, setPrice] = useState('0');
    const [submitting, setSubmitting] = useState(false);

    const handlePublish = async () => {
        if (!title.trim()) {
            Alert.alert('Validation Error', 'Title is required');
            return;
        }
        if (!accessToken) return;

        setSubmitting(true);
        try {
            await api.createMarketplaceListing({
                agent_id: route.params.agentId,
                title: title.trim(),
                summary: summary.trim(),
                category: category.trim() || 'General',
                price_cents: parseInt(price) ? Math.floor(parseFloat(price) * 100) : 0,
                status: 'active'
            }, accessToken);

            Alert.alert('Success', 'Agent published to marketplace!');

            // Go to my listings or go back to main tab
            navigation.navigate('MyListings');
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Failed to publish listing');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <ScreenWrapper style={styles.wrapper} padded={false}>
            <ScrollView contentContainerStyle={[styles.form, { paddingBottom: insets.bottom + Spacing.xl }]}>
                <Text style={[styles.headerText, { color: colors.text }]}>Publish to Marketplace</Text>
                <Text style={[styles.subText, { color: colors.textSecondary }]}>
                    Share your custom agent with the community. They will receive a full copy of the agent and its skills.
                </Text>

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

                <TouchableOpacity
                    style={[styles.submitBtn, { backgroundColor: colors.primary }]}
                    onPress={handlePublish}
                    disabled={submitting}
                >
                    {submitting ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.submitBtnText}>Publish Listing</Text>
                    )}
                </TouchableOpacity>
            </ScrollView>
        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    wrapper: { flex: 1 },
    headerText: { fontSize: 22, fontWeight: '700', marginBottom: Spacing.xs },
    subText: { fontSize: 14, lineHeight: 20, marginBottom: Spacing.xl },
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
    submitBtn: {
        height: 52,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: Spacing.md,
    },
    submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
