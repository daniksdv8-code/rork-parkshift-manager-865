import { Tabs, useRouter } from "expo-router";
import { LayoutDashboard, CarFront, ParkingCircle, Users, Menu } from "lucide-react-native";
import React, { useEffect, useRef } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { useColors } from "@/providers/ThemeProvider";

export default function TabLayout() {
  const { currentUser, isLoading } = useAuth();
  const router = useRouter();
  const colors = useColors();
  const isNavigating = useRef(false);

  useEffect(() => {
    if (isLoading) return;
    if (!currentUser && !isNavigating.current) {
      isNavigating.current = true;
      console.log('[TabLayout] No user, redirecting to login');
      setTimeout(() => {
        router.replace('/login');
        setTimeout(() => { isNavigating.current = false; }, 500);
      }, 50);
    }
  }, [currentUser, isLoading, router]);

  if (isLoading || !currentUser) return null;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600' as const,
        },
      }}
    >
      <Tabs.Screen
        name="(dashboard)"
        options={{
          title: "Главная",
          tabBarIcon: ({ color, size }) => <LayoutDashboard size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="checkin"
        options={{
          title: "Заезд",
          tabBarIcon: ({ color, size }) => <CarFront size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="parking"
        options={{
          title: "Парковка",
          tabBarIcon: ({ color, size }) => <ParkingCircle size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: "Клиенты",
          tabBarIcon: ({ color, size }) => <Users size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "Ещё",
          tabBarIcon: ({ color, size }) => <Menu size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
