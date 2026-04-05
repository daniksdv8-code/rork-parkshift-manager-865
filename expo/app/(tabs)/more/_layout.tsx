import { Stack } from "expo-router";
import { useColors } from "@/providers/ThemeProvider";

export default function MoreLayout() {
  const colors = useColors();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Ещё" }} />
      <Stack.Screen name="debtors" options={{ title: "Должники" }} />
      <Stack.Screen name="history" options={{ title: "История" }} />
      <Stack.Screen name="cashregister" options={{ title: "Касса" }} />
      <Stack.Screen name="reports" options={{ title: "Отчёты" }} />
      <Stack.Screen name="actionlog" options={{ title: "Журнал действий" }} />
      <Stack.Screen name="settings" options={{ title: "Настройки" }} />
      <Stack.Screen name="schedule" options={{ title: "Календарь смен" }} />
      <Stack.Screen name="finance" options={{ title: "Финансы" }} />
      <Stack.Screen name="salaryadvances" options={{ title: "Зарплаты и авансы" }} />
      <Stack.Screen name="export" options={{ title: "Экспорт данных" }} />
      <Stack.Screen name="violations" options={{ title: "Нарушения" }} />
      <Stack.Screen name="cleanup" options={{ title: "Чек-лист уборки" }} />
      <Stack.Screen name="anomalylog" options={{ title: "Самодиагностика" }} />
      <Stack.Screen name="loginlog" options={{ title: "Лог входов" }} />
      <Stack.Screen name="totalcash" options={{ title: "Общая касса" }} />
    </Stack>
  );
}
