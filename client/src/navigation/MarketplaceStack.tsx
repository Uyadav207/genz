import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '@/contexts';
import type { MarketplaceStackParamList } from '@/types';
import { MarketplaceScreen, MarketplaceDetailScreen, MyListingsScreen, PublishListingScreen, EditMarketplaceListingScreen } from '@/screens';

const Stack = createNativeStackNavigator<MarketplaceStackParamList>();

export function MarketplaceStack() {
    const { colors } = useTheme();

    return (
        <Stack.Navigator
            initialRouteName="MarketplaceList"
            screenOptions={{
                headerStyle: { backgroundColor: colors.background },
                headerTintColor: colors.text,
                headerTitleStyle: { fontWeight: '600' },
                headerShadowVisible: false,
                contentStyle: { backgroundColor: colors.background },
                headerShown: true,
            }}
        >
            <Stack.Screen
                name="MarketplaceList"
                component={MarketplaceScreen}
                options={{ title: 'Marketplace', headerShown: false }}
            />
            <Stack.Screen
                name="MarketplaceDetail"
                component={MarketplaceDetailScreen}
                options={{ title: 'Agent Details' }}
            />
            <Stack.Screen
                name="PublishListing"
                component={PublishListingScreen}
                options={{ title: 'Publish Agent' }}
            />
            <Stack.Screen
                name="EditListing"
                component={EditMarketplaceListingScreen}
                options={{ title: 'Edit Listing' }}
            />
            <Stack.Screen
                name="MyListings"
                component={MyListingsScreen}
                options={{ title: 'My Listings' }}
            />
        </Stack.Navigator>
    );
}
