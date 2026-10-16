import React, { useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Colors, Fonts } from '@/constants/theme';
import { useFont } from '@/context/FontContext';
import { haptics } from '@/utils/haptics';

const ITEM_HEIGHT = 40;
const VISIBLE_ITEMS = 5;

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

interface MonthPickerProps {
  year: number;
  month: number; // 1-12
  onChange: (year: number, month: number) => void;
  minYear?: number;
  minMonth?: number; // 1-12, only applied when year === minYear
  maxYear?: number;
  maxMonth?: number; // 1-12, only applied when year === maxYear
}

interface WheelProps {
  data: (string | number)[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  width: number;
  formatItem?: (item: string | number) => string;
  /** Items at this index and beyond are grayed out and can't be selected */
  disabledFromIndex?: number;
  /** Items before this index are grayed out and can't be selected */
  disabledBeforeIndex?: number;
}

function Wheel({ data, selectedIndex, onSelect, width, formatItem, disabledFromIndex, disabledBeforeIndex }: WheelProps) {
  const { fonts } = useFont();
  const translateY = useSharedValue(-selectedIndex * ITEM_HEIGHT);
  const savedTranslateY = useSharedValue(-selectedIndex * ITEM_HEIGHT);
  const lastReportedIndex = useRef(selectedIndex);
  const effectiveMax = disabledFromIndex != null ? disabledFromIndex - 1 : data.length - 1;
  const effectiveMin = disabledBeforeIndex ?? 0;
  const maxIndex = Math.max(effectiveMin, effectiveMax);

  // Sync position when parent changes selectedIndex (e.g. arrow buttons)
  useEffect(() => {
    if (selectedIndex !== lastReportedIndex.current) {
      const target = -selectedIndex * ITEM_HEIGHT;
      translateY.value = withSpring(target, { damping: 20, stiffness: 200, mass: 0.5 });
      savedTranslateY.value = target;
      lastReportedIndex.current = selectedIndex;
    }
  }, [selectedIndex]);

  const doHaptic = useCallback(() => haptics.tap(), []);

  const reportSelect = useCallback(
    (index: number) => {
      if (index !== lastReportedIndex.current) {
        lastReportedIndex.current = index;
        onSelect(index);
      }
    },
    [onSelect],
  );

  const panGesture = Gesture.Pan()
    .activeOffsetY([-5, 5])
    .failOffsetX([-20, 20])
    .onUpdate((e) => {
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd((e) => {
      const projected = translateY.value + e.velocityY * 0.15;
      const rawIndex = Math.round(-projected / ITEM_HEIGHT);
      const snappedIndex = Math.max(effectiveMin, Math.min(rawIndex, maxIndex));
      const target = -snappedIndex * ITEM_HEIGHT;

      translateY.value = withSpring(target, {
        damping: 20,
        stiffness: 200,
        mass: 0.5,
      });
      savedTranslateY.value = target;

      runOnJS(doHaptic)();
      runOnJS(reportSelect)(snappedIndex);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const centerOffset = Math.floor(VISIBLE_ITEMS / 2) * ITEM_HEIGHT;

  return (
    <GestureDetector gesture={panGesture}>
      <View style={[styles.wheelContainer, { width, height: ITEM_HEIGHT * VISIBLE_ITEMS }]}>
        <Animated.View style={[{ paddingTop: centerOffset }, animatedStyle]}>
          {data.map((item, i) => {
            const display = formatItem ? formatItem(item) : String(item);
            const isDisabled = (disabledFromIndex != null && i >= disabledFromIndex) || (disabledBeforeIndex != null && i < disabledBeforeIndex);
            return (
              <View key={`${item}-${i}`} style={[styles.wheelItem, { width, height: ITEM_HEIGHT }]}>
                <Text style={[
                  styles.wheelItemText,
                  { fontFamily: fonts.light },
                  isDisabled && { color: Colors.borderPrimary },
                ]}>{display}</Text>
              </View>
            );
          })}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

export default function MonthPicker({
  year,
  month,
  onChange,
  minYear = 2020,
  minMonth,
  maxYear,
  maxMonth,
}: MonthPickerProps) {

  const effectiveMaxYear = maxYear ?? new Date().getFullYear();
  const PADDING_YEARS = 10;
  const displayMinYear = minYear - PADDING_YEARS;
  const displayMaxYear = effectiveMaxYear + PADDING_YEARS;
  const years = Array.from(
    { length: displayMaxYear - displayMinYear + 1 },
    (_, i) => displayMinYear + i,
  );
  // Indexes for disabling
  const yearDisabledBefore = PADDING_YEARS; // first valid year is at index PADDING_YEARS
  const yearDisabledFrom = PADDING_YEARS + (effectiveMaxYear - minYear) + 1; // first invalid year after max

  const yearRef = useRef(year);
  const monthRef = useRef(month);

  // Keep refs in sync with props (arrow navigation changes props externally)
  useEffect(() => { yearRef.current = year; }, [year]);
  useEffect(() => { monthRef.current = month; }, [month]);

  const emit = useCallback(() => {
    onChange(yearRef.current, monthRef.current);
  }, [onChange]);

  const handleMonthSelect = useCallback((index: number) => {
    monthRef.current = index + 1;
    // Clamp if at max year
    if (maxMonth && yearRef.current === effectiveMaxYear && monthRef.current > maxMonth) {
      monthRef.current = maxMonth;
    }
    // Clamp if at min year
    if (minMonth && yearRef.current === minYear && monthRef.current < minMonth) {
      monthRef.current = minMonth;
    }
    emit();
  }, [emit, maxMonth, effectiveMaxYear, minMonth, minYear]);

  const handleYearSelect = useCallback((index: number) => {
    yearRef.current = displayMinYear + index;
    // Clamp month if at max year
    if (maxMonth && yearRef.current === effectiveMaxYear && monthRef.current > maxMonth) {
      monthRef.current = maxMonth;
    }
    // Clamp month if at min year
    if (minMonth && yearRef.current === minYear && monthRef.current < minMonth) {
      monthRef.current = minMonth;
    }
    emit();
  }, [emit, displayMinYear, maxMonth, effectiveMaxYear, minMonth, minYear]);

  const monthIndex = month - 1;
  const yearIndex = year - displayMinYear;

  // Gray out future months when at max year
  const monthDisabledFrom = (maxMonth && yearRef.current === effectiveMaxYear)
    ? maxMonth
    : undefined;

  // Gray out past months when at min year
  const monthDisabledBefore = (minMonth && yearRef.current === minYear)
    ? minMonth - 1  // minMonth is 1-based; index = minMonth-1 is the first allowed, so disable before it
    : undefined;

  return (
    <View style={styles.container}>
      <View style={styles.selectionBand} pointerEvents="none" />

      <View style={styles.wheels}>
        <Wheel
          data={MONTHS}
          selectedIndex={monthIndex}
          onSelect={handleMonthSelect}
          width={140}
          disabledFromIndex={monthDisabledFrom}
          disabledBeforeIndex={monthDisabledBefore}
        />
        <Wheel
          data={years}
          selectedIndex={Math.max(0, yearIndex)}
          onSelect={handleYearSelect}
          width={72}
          formatItem={(item) => String(item)}
          disabledBeforeIndex={yearDisabledBefore}
          disabledFromIndex={yearDisabledFrom}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    paddingVertical: 12,
  },
  selectionBand: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: 12 + ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2),
    height: ITEM_HEIGHT,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.borderPrimary,
    zIndex: 1,
  },
  wheels: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  wheelContainer: {
    overflow: 'hidden',
  },
  wheelItem: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelItemText: {
    fontFamily: Fonts.mono.light,
    fontSize: 20,
    color: Colors.textPrimary,
  },
});
