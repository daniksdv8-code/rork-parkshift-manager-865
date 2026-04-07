import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "@/providers/AuthProvider";
import { ParkingProvider } from "@/providers/ParkingProvider";
import { ThemeProvider, useColors } from "@/providers/ThemeProvider";

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const colors = useColors();

  return (
    <Stack
      screenOptions={{
        headerBackTitle: "Назад",
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.primary,
        headerTitleStyle: {
          color: colors.text,
          fontSize: 17,
          fontWeight: '700' as const,
        },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false, presentation: "fullScreenModal" }} />
      <Stack.Screen name="client-card" options={{ title: "Клиент", presentation: "modal" }} />
      <Stack.Screen name="exit-modal" options={{ title: "Выезд", presentation: "modal" }} />
      <Stack.Screen name="add-client-modal" options={{ title: "Новый клиент", presentation: "modal" }} />
      <Stack.Screen name="pay-debt-modal" options={{ title: "Оплата долга", presentation: "modal" }} />
      <Stack.Screen name="pay-monthly-modal" options={{ title: "Оплата месяца", presentation: "modal" }} />
      <Stack.Screen name="add-violation-modal" options={{ title: "Новое нарушение", presentation: "modal" }} />
      <Stack.Screen name="checkin-modal" options={{ title: "Оформить заезд", presentation: "modal" }} />
      <Stack.Screen name="global-search" options={{ title: "Поиск", presentation: "modal" }} />
      <Stack.Screen name="debtors-screen" options={{ title: "Должники" }} />
      <Stack.Screen name="cashregister-screen" options={{ title: "Касса" }} />
      <Stack.Screen name="history-screen" options={{ title: "История" }} />
      <Stack.Screen name="totalcash-screen" options={{ title: "Общая касса" }} />
      <Stack.Screen name="violations-screen" options={{ title: "Нарушения" }} />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider>
          <AuthProvider>
            <ParkingProvider>
              <RootLayoutNav />
            </ParkingProvider>
          </AuthProvider>
        </ThemeProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
