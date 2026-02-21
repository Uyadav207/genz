/**
 * Generated Image Gallery — displays AI-generated images with download support.
 * Full-width rendering with rounded card styling and download/share button.
 */

import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { Download, Check, ExternalLink } from 'lucide-react-native';
import type { GeneratedImageItem } from '@/services/api';
import type { ThemeColors } from '@/contexts';

interface GeneratedImageGalleryProps {
    images: GeneratedImageItem[];
    colors: ThemeColors;
}

export function GeneratedImageGallery({ images, colors }: GeneratedImageGalleryProps) {
    if (!images?.length) return null;

    return (
        <View style={styles.container}>
            {images.map((img, i) => (
                <GeneratedImageCard key={`${img.imageUrl}-${i}`} image={img} colors={colors} />
            ))}
        </View>
    );
}

function GeneratedImageCard({ image, colors }: { image: GeneratedImageItem; colors: ThemeColors }) {
    const [downloading, setDownloading] = useState(false);
    const [downloaded, setDownloaded] = useState(false);
    const [imageLoading, setImageLoading] = useState(true);

    const handleDownload = async () => {
        if (downloading || downloaded) return;
        setDownloading(true);

        try {
            // Download to a temp file then share it
            const fileName = `generated_${Date.now()}.png`;
            const fileUri = `${(FileSystem as any).cacheDirectory ?? ''}${fileName}`;
            const { uri } = await (FileSystem as any).downloadAsync(image.imageUrl, fileUri);

            // Use the share intent to let user save/share
            if (Platform.OS === 'ios') {
                // On iOS, use the Sharing module if available, otherwise open in browser
                try {
                    const Sharing = require('expo-sharing');
                    if (await Sharing.isAvailableAsync()) {
                        await Sharing.shareAsync(uri);
                        setDownloaded(true);
                        setTimeout(() => setDownloaded(false), 3000);
                    } else {
                        await Linking.openURL(image.imageUrl);
                    }
                } catch {
                    // expo-sharing not available, open in browser
                    await Linking.openURL(image.imageUrl);
                }
            } else {
                // On Android, try MediaLibrary if available, otherwise open in browser
                try {
                    const MediaLibrary = require('expo-media-library');
                    const { status } = await MediaLibrary.requestPermissionsAsync();
                    if (status === 'granted') {
                        await MediaLibrary.saveToLibraryAsync(uri);
                        setDownloaded(true);
                        setTimeout(() => setDownloaded(false), 3000);
                    } else {
                        await Linking.openURL(image.imageUrl);
                    }
                } catch {
                    await Linking.openURL(image.imageUrl);
                }
            }
        } catch (err) {
            console.error('[GeneratedImageGallery] Download error:', err);
            Alert.alert('Download failed', 'Could not save the image. Opening in browser instead.');
            Linking.openURL(image.imageUrl).catch(() => { });
        } finally {
            setDownloading(false);
        }
    };

    const handleOpenInBrowser = () => {
        Linking.openURL(image.imageUrl).catch(() => { });
    };

    return (
        <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <View style={styles.imageContainer}>
                {imageLoading && (
                    <View style={styles.loadingOverlay}>
                        <ActivityIndicator size="small" color={colors.textSecondary} />
                    </View>
                )}
                <Image
                    source={{ uri: image.imageUrl }}
                    style={styles.image}
                    resizeMode="contain"
                    onLoadEnd={() => setImageLoading(false)}
                />
            </View>

            <View style={styles.footer}>
                <Text style={[styles.caption, { color: colors.textSecondary }]} numberOfLines={2}>
                    {image.title}
                </Text>
                <View style={styles.actions}>
                    <TouchableOpacity
                        style={[styles.iconButton, { backgroundColor: colors.border }]}
                        onPress={handleOpenInBrowser}
                        activeOpacity={0.7}
                    >
                        <ExternalLink size={16} color={colors.text} strokeWidth={2} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[
                            styles.downloadButton,
                            downloaded
                                ? { backgroundColor: '#22C55E' }
                                : { backgroundColor: colors.primary },
                        ]}
                        onPress={handleDownload}
                        activeOpacity={0.7}
                        disabled={downloading}
                    >
                        {downloading ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : downloaded ? (
                            <>
                                <Check size={14} color="#fff" strokeWidth={2.5} />
                                <Text style={styles.downloadText}>Saved</Text>
                            </>
                        ) : (
                            <>
                                <Download size={14} color="#fff" strokeWidth={2.5} />
                                <Text style={styles.downloadText}>Save</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginTop: 8,
        gap: 12,
    },
    card: {
        borderRadius: 16,
        borderWidth: 1,
        overflow: 'hidden',
    },
    imageContainer: {
        width: '100%',
        aspectRatio: 1,
        backgroundColor: '#000',
        position: 'relative',
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.3)',
        zIndex: 1,
    },
    image: {
        width: '100%',
        height: '100%',
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 14,
        paddingVertical: 12,
        gap: 12,
    },
    caption: {
        flex: 1,
        fontSize: 13,
        lineHeight: 18,
    },
    actions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    iconButton: {
        width: 34,
        height: 34,
        borderRadius: 17,
        justifyContent: 'center',
        alignItems: 'center',
    },
    downloadButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
    },
    downloadText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
    },
});
