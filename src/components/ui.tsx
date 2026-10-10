import { createContext, useContext, useState, type ReactNode } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { SymbolView } from 'expo-symbols';

import { WaveRule } from '@/components/waveRule';
import { dockClearance } from '@/theme/dock';
import { type Paper } from '@/theme/palette';

export { WaveRule };

function onFill(fill: string): string {
  const hex = fill.replace('#', '');
  if (hex.length !== 6) return '#F4F4F4';
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.62 ? '#141414' : '#F4F4F4';
}

function edges(color: string) {
  return {
    borderColor: color,
    borderTopColor: color,
    borderRightColor: color,
    borderBottomColor: color,
    borderLeftColor: color,
  };
}

export function Screen({
  paper,
  children,
}: {
  paper: Paper;
  children: ReactNode;
}) {
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: paper.bg }]} edges={['left', 'right']}>
      {children}
    </SafeAreaView>
  );
}

export function Title({ children, color }: { children: ReactNode; color: string }) {
  return <Text style={[styles.title, { color }]}>{children}</Text>;
}

// Height / width of the repaired brush file. The sheet overlaps the lower
// tails. The flat cap of the source brush is already faded inside the file.
const KAIZEN_ASPECT = 700 / 616;
const WAVE_ASPECT = 774 / 1360;

function kaizenBox(width: number, insetTop: number) {
  // The file is cropped to the ink, then drawn wider than the screen so the
  // brush meets both edges. It is only a background. It does not reserve a
  // band above the sheet.
  const markWidth = Math.round(width * 1.08);
  const markHeight = Math.round(markWidth * KAIZEN_ASPECT);
  const top = Math.max(0, insetTop - 6);
  const left = Math.round((width - markWidth) / 2);
  return { markWidth, markHeight, top, left };
}

export function InkHeader({ color }: { color: string }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const box = kaizenBox(width, insets.top);
  return (
    <View pointerEvents="none" style={styles.inkHeader}>
      <Image
        source={require('../../assets/images/ink-kaizen-wide.png')}
        style={{
          position: 'absolute',
          top: box.top,
          left: box.left,
          width: box.markWidth,
          height: box.markHeight,
          tintColor: color,
        }}
        resizeMode="contain"
      />
    </View>
  );
}

export function InkFooter({ color, back = false }: { color: string; back?: boolean }) {
  const { width } = useWindowDimensions();
  // Wider than the screen so the faded sides run off the bezel. The height
  // stays the slot height on purpose: scaling the bitmap up and clipping it
  // sliced the crest in a straight line, and a percentage width plus
  // aspectRatio falls back to the bitmap's pixel size.
  const height = Math.round(width * WAVE_ASPECT);
  const bleed = Math.round(width * 1.14);
  return (
    <View pointerEvents="none" style={[back ? styles.waveBack : null, styles.waveBand, { height }]}>
      <Image
        source={require('../../assets/images/ink-wave-poster.png')}
        style={{
          position: 'absolute',
          bottom: 0,
          left: Math.round((width - bleed) / 2),
          width: bleed,
          height,
          tintColor: color,
        }}
        resizeMode="stretch"
      />
    </View>
  );
}

// Space between the sheet's bottom border and the top of the tab circle.
const SHEET_GAP = 12;
const SHEET_BORDER = 1;

type SheetSlot = {
  band: number;
  refreshControl?: React.ComponentProps<typeof ScrollView>['refreshControl'];
  keyboardShouldPersistTaps?: React.ComponentProps<typeof ScrollView>['keyboardShouldPersistTaps'];
};

const SheetSlotContext = createContext<SheetSlot | null>(null);

export function PageScroll({
  center = false,
  refreshControl,
  keyboardShouldPersistTaps,
  children,
}: {
  center?: boolean;
  refreshControl?: React.ComponentProps<typeof ScrollView>['refreshControl'];
  keyboardShouldPersistTaps?: React.ComponentProps<typeof ScrollView>['keyboardShouldPersistTaps'];
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  // The dock is drawn on top of the screen. This padding is the part of the
  // screen the sheet is not allowed to enter.
  const dock = dockClearance(insets.bottom);
  const [band, setBand] = useState(0);

  return (
    <View
      style={[
        styles.pageScroll,
        {
          paddingTop: insets.top,
          paddingBottom: dock + SHEET_GAP,
          paddingHorizontal: 16,
        },
      ]}
    >
      <View
        collapsable={false}
        style={{ flex: 1, minHeight: 0, justifyContent: center ? 'center' : 'flex-start' }}
        onLayout={(event) => {
          const next = Math.round(event.nativeEvent.layout.height);
          setBand((current) => (current === next ? current : next));
        }}
      >
        <SheetSlotContext.Provider value={{ band, refreshControl, keyboardShouldPersistTaps }}>
          {children}
        </SheetSlotContext.Provider>
      </View>
    </View>
  );
}

export function Star({ color }: { color: string }) {
  return (
    <SymbolView
      name={{ ios: 'star.fill', android: 'star', web: 'star' }}
      size={14}
      tintColor={color}
      weight="regular"
    />
  );
}

export function Sheet({ paper, children }: { paper: Paper; children: ReactNode }) {
  const slot = useContext(SheetSlotContext);
  const [content, setContent] = useState(0);
  const band = slot?.band ?? 0;
  const measured = content > 0;
  // The border sits inside the box. Add it once so a short sheet does not
  // gain a second, tiny scroll just to reveal its own stroke.
  const outer = content + SHEET_BORDER * 2;
  const height = band > 0 ? (measured ? Math.min(outer, band) : band) : undefined;
  const remember = (nextHeight: number) => {
    const next = Math.round(nextHeight);
    if (next <= 0) return;
    setContent((current) => (current === next ? current : next));
  };

  if (slot == null) {
    return (
      <View collapsable={false} style={[styles.sheet, styles.sheetBody, { backgroundColor: paper.surface, ...edges(paper.rule) }]}>
        {children}
      </View>
    );
  }

  return (
    <ScrollView
      style={[
        styles.sheet,
        {
          backgroundColor: paper.surface,
          ...edges(paper.rule),
          flexGrow: 0,
          flexShrink: 1,
          maxHeight: band > 0 ? band : undefined,
        },
        height != null ? { height } : null,
        band > 0 && measured ? null : { opacity: 0 },
      ]}
      scrollEnabled={Boolean(slot.refreshControl) || (measured && outer > band)}
      nestedScrollEnabled
      removeClippedSubviews={false}
      overScrollMode="never"
      keyboardShouldPersistTaps={slot.keyboardShouldPersistTaps}
      refreshControl={slot.refreshControl}
    >
      <View
        collapsable={false}
        style={styles.sheetBody}
        onLayout={(event) => remember(event.nativeEvent.layout.height)}
      >
        {children}
      </View>
    </ScrollView>
  );
}

export function Muted({ children, color }: { children: ReactNode; color: string }) {
  return <Text style={[styles.muted, { color }]}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  color,
  textColor,
  outline,
}: {
  label: string;
  onPress: () => void;
  color: string;
  textColor: string;
  outline?: boolean;
}) {
  return (
    <Pressable
      collapsable={false}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        outline ? { ...edges(color), backgroundColor: 'transparent' } : { ...edges(color), backgroundColor: color },
        pressed ? { opacity: 0.72 } : null,
      ]}>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={[styles.buttonText, { color: textColor }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  paper,
  placeholder,
  multiline,
  onBlur,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  paper: Paper;
  placeholder?: string;
  multiline?: boolean;
  onBlur?: () => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: paper.text }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor={paper.muted}
        multiline={multiline}
        style={[
          styles.input,
          multiline && styles.multiline,
          { color: paper.text, backgroundColor: paper.surface, ...edges(paper.rule) },
        ]}
      />
    </View>
  );
}

export function Card({
  paper,
  children,
  style,
  wave,
}: {
  paper: Paper;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  wave?: boolean;
}) {
  return (
    <View collapsable={false} style={[styles.card, { backgroundColor: paper.surface, ...edges(paper.rule) }, wave ? styles.waveBorder : null, style]}>
      {wave ? <WaveRule color={paper.text} inset={16} /> : null}
      {children}
    </View>
  );
}

export function RowButton({
  label,
  detail,
  note,
  noteColor,
  onPress,
  paper,
  dimmed,
  labelColor,
  struck,
  wave,
}: {
  label: string;
  detail?: string;
  note?: string;
  noteColor?: string;
  onPress: () => void;
  paper: Paper;
  dimmed?: boolean;
  labelColor?: string;
  struck?: boolean;
  wave?: boolean;
}) {
  const ink = labelColor ?? paper.text;
  const spoken = [label, detail, note].filter(Boolean).join(', ');
  return (
    <Pressable
      collapsable={false}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={struck ? `${label}, done` : note ? spoken : undefined}
      style={[
        styles.row,
        {
          backgroundColor: paper.surface,
          ...edges(paper.rule),
          opacity: dimmed ? 0.45 : 1,
        },
        wave ? styles.waveBorder : null,
      ]}>
      {wave ? <WaveRule color={paper.text} inset={14} /> : null}
      <Text
        style={[
          styles.rowLabel,
          { color: ink },
          struck ? { textDecorationLine: 'line-through', textDecorationColor: ink } : null,
        ]}>
        {label}
      </Text>
      {detail || note ? (
        <Text style={styles.rowDetail}>
          {detail ? <Text style={{ color: paper.muted }}>{detail}</Text> : null}
          {detail && note ? <Text style={{ color: paper.muted }}>{'  '}</Text> : null}
          {note ? <Text style={{ color: noteColor ?? paper.muted }}>{note}</Text> : null}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function Empty({ title, body, color, muted }: { title: string; body: string; color: string; muted: string }) {
  return (
    <View style={styles.empty}>
      <Text style={[styles.title, { color }]}>{title}</Text>
      <Text style={[styles.muted, { color: muted }]}>{body}</Text>
    </View>
  );
}

export function Chip({
  label,
  selected,
  accent,
  paper,
  onPress,
  idleColor,
}: {
  label: string;
  selected: boolean;
  accent: string;
  paper: Paper;
  onPress: () => void;
  idleColor?: string;
}) {
  const ink = selected ? accent : (idleColor ?? paper.rule);
  return (
    <Pressable
      onPress={onPress}
      collapsable={false}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? accent : paper.surface,
          ...edges(ink),
        },
      ]}>
      <Text style={[styles.chipText, { color: selected ? onFill(accent) : (idleColor ?? paper.text) }]}>{label}</Text>
    </Pressable>
  );
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

const frame = {
  borderWidth: 1,
  borderTopWidth: 1,
  borderRightWidth: 1,
  borderBottomWidth: 1,
  borderLeftWidth: 1,
  borderStyle: 'solid' as const,
  borderRadius: 20,
} as const;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  title: { fontSize: 22, fontFamily: 'Georgia', lineHeight: 28 },
  inkHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 560,
    overflow: 'visible',
    zIndex: 0,
  },
  waveBack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  waveBand: {
    width: '100%',
    overflow: 'hidden',
  },
  pageScroll: { flex: 1, backgroundColor: 'transparent', zIndex: 1 },
  sheet: {
    ...frame,
    borderRadius: 28,
    overflow: 'hidden',
  },
  sheetBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 14,
    gap: 14,
  },
  muted: { fontFamily: 'Georgia', fontSize: 14, lineHeight: 20, marginTop: 2 },
  button: {
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 14,
    ...frame,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontFamily: 'Georgia', fontSize: 12, fontWeight: '700', letterSpacing: 1.6, textTransform: 'uppercase' },
  field: { gap: 6 },
  label: { fontFamily: 'Georgia', fontSize: 11, fontWeight: '700', letterSpacing: 1.8, textTransform: 'uppercase' },
  input: { ...frame, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontFamily: 'Georgia' },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  card: { ...frame, padding: 16, gap: 8, overflow: 'hidden' },
  row: { ...frame, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 8, gap: 2, overflow: 'hidden' },
  // The wave occupies the top stroke. The extra top padding keeps the label below it.
  waveBorder: { borderTopWidth: 0, paddingTop: 22 },
  rowLabel: { fontFamily: 'Georgia', fontSize: 16 },
  rowDetail: { fontFamily: 'Georgia', fontSize: 12, letterSpacing: 0.6 },
  empty: { paddingVertical: 32, gap: 8 },
  chip: { ...frame, paddingHorizontal: 12, paddingVertical: 8, minHeight: 44, justifyContent: 'center' },
  chipText: { fontFamily: 'Georgia', fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
});

export function textStyle(color: string, extra?: TextStyle): TextStyle {
  return { color, ...extra };
}
