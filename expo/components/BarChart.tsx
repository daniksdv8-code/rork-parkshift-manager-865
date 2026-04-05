import React, { useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { useColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';

interface BarChartProps {
  data: { label: string; value: number; color?: string }[];
  height?: number;
  formatValue?: (v: number) => string;
  title?: string;
}

export default React.memo(function BarChart({
  data,
  height = 160,
  formatValue = (v) => String(v),
  title,
}: BarChartProps) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const maxValue = Math.max(...data.map(d => d.value), 1);
  const animValues = useRef(data.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const anims = animValues.map((anim, i) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: 500,
        delay: i * 40,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      })
    );
    Animated.stagger(30, anims).start();
  }, [animValues]);

  if (data.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Нет данных</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {title && <Text style={styles.title}>{title}</Text>}
      <View style={[styles.chartArea, { height }]}>
        <View style={styles.gridLines}>
          {[0.25, 0.5, 0.75, 1].map((pct, i) => (
            <View key={i} style={[styles.gridLine, { bottom: `${pct * 100}%` as unknown as number }]}>
              <Text style={styles.gridLabel}>{formatValue(Math.round(maxValue * pct))}</Text>
            </View>
          ))}
        </View>
        <View style={styles.barsRow}>
          {data.map((item, i) => {
            const barHeight = animValues[i]
              ? animValues[i].interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, (item.value / maxValue) * height * 0.85],
                })
              : 0;
            return (
              <View key={i} style={styles.barColumn}>
                <View style={styles.barWrapper}>
                  <Animated.View
                    style={[
                      styles.bar,
                      {
                        height: barHeight,
                        backgroundColor: item.color ?? colors.primary,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.barLabel} numberOfLines={1}>{item.label}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
});

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  title: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.text,
    marginBottom: 12,
  },
  chartArea: {
    position: 'relative',
  },
  gridLines: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 20,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
  },
  gridLabel: {
    fontSize: 9,
    color: colors.textTertiary,
    position: 'absolute',
    left: 0,
    top: -12,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flex: 1,
    gap: 4,
    paddingBottom: 20,
    paddingLeft: 30,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
  },
  barWrapper: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '70%',
    minWidth: 8,
    maxWidth: 32,
    borderRadius: 4,
    minHeight: 2,
  },
  barLabel: {
    fontSize: 9,
    color: colors.textTertiary,
    marginTop: 4,
    textAlign: 'center' as const,
  },
  emptyContainer: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 13,
    color: colors.textTertiary,
  },
});
