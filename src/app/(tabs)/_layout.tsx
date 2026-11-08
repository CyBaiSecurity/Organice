import { useContext } from 'react';
import { Easing, Pressable, StyleSheet, Text, View, useColorScheme, useWindowDimensions, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs } from 'expo-router/js-tabs';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { BottomTabBarHeightCallbackContext } from 'expo-router/build/react-navigation/bottom-tabs/utils/BottomTabBarHeightCallbackContext';

import { dockBottomInset, dockHeight } from '@/theme/dock';
import { PAPER, type Paper } from '@/theme/palette';
import { useOrganice } from '@/state/organice';

const TAB_ICONS: Record<string, SymbolViewProps['name']> = {
  index: { ios: 'square.grid.2x2', android: 'space_dashboard', web: 'space_dashboard' },
  guide: { ios: 'map', android: 'route', web: 'route' },
  todo: { ios: 'list.bullet', android: 'format_list_bulleted', web: 'format_list_bulleted' },
  tasks: { ios: 'checklist', android: 'checklist', web: 'checklist' },
  ideas: { ios: 'lightbulb', android: 'lightbulb', web: 'lightbulb' },
  calendar: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
};

function visibleLabel(title: string | undefined, tabBarLabel: unknown, routeName: string): string {
  if (typeof tabBarLabel === 'string' && tabBarLabel.trim().length > 0) return tabBarLabel;
  return title ?? routeName;
}

function GlassDock({
  state,
  descriptors,
  navigation,
  paper,
  dockBottom,
}: BottomTabBarProps & { paper: Paper; dockBottom: number }) {
  const reportHeight = useContext(BottomTabBarHeightCallbackContext);
  const { fontScale } = useWindowDimensions();
  const barHeight = dockHeight(fontScale);
  const labelHeight = 28 * fontScale;

  return (
    <View
      pointerEvents="box-none"
      onLayout={(event) => reportHeight?.(event.nativeEvent.layout.height)}
      style={[
        styles.bar,
        {
          paddingBottom: dockBottom,
          backgroundColor: paper.surface,
          borderTopColor: paper.text,
          borderRightColor: paper.text,
          borderBottomColor: paper.text,
          borderLeftColor: paper.text,
        },
      ]}>
      <View pointerEvents="box-none" style={[styles.slots, { height: barHeight }]}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const { options } = descriptors[route.key];
          const shown = visibleLabel(options.title, options.tabBarLabel, route.name);
          const accessible = options.tabBarAccessibilityLabel ?? options.title ?? route.name;
          const iconName = TAB_ICONS[route.name];
          const iconColor: ColorValue = paper.text;
          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={accessible}
              onPress={onPress}
              style={[styles.slot, { height: barHeight }]}>
              <View style={[styles.slotFill, focused ? { backgroundColor: paper.bg } : null]}>
                {iconName ? <SymbolView name={iconName} size={20} tintColor={iconColor} weight="regular" /> : null}
                <View style={[styles.labelSlot, { height: labelHeight }]}>
                  <Text
                    numberOfLines={2}
                    style={[styles.label, { color: paper.text, fontWeight: focused ? '600' : '400' }]}>
                    {shown}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  const scheme = useColorScheme();
  const { settings } = useOrganice();
  const mode =
    settings.appearance === 'dark' ? 'dark' : settings.appearance === 'light' ? 'light' : scheme === 'dark' ? 'dark' : 'light';
  const paper = PAPER[mode];
  const insets = useSafeAreaInsets();
  const dockBottom = dockBottomInset(insets.bottom);

  return (
    <View style={{ flex: 1, backgroundColor: paper.bg }}>
      <Tabs
        tabBar={(props) => <GlassDock {...props} paper={paper} dockBottom={dockBottom} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: 'transparent' },
          tabBarStyle: { backgroundColor: 'transparent', borderTopWidth: 0, elevation: 0 },
          animation: 'fade',
          transitionSpec: {
            animation: 'timing',
            config: { duration: 260, easing: Easing.inOut(Easing.ease) },
          },
        }}>
        <Tabs.Screen
          name="index"
          options={{ title: 'Dashboard', tabBarLabel: 'Home', tabBarAccessibilityLabel: 'Dashboard' }}
        />
        <Tabs.Screen name="guide" options={{ title: 'Routine' }} />
        <Tabs.Screen name="todo" options={{ title: 'To-do' }} />
        <Tabs.Screen name="tasks" options={{ title: 'Tasks' }} />
        <Tabs.Screen name="ideas" options={{ title: 'Ideas' }} />
        <Tabs.Screen name="calendar" options={{ title: 'Calendar' }} />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
    borderTopWidth: 1,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    elevation: 0,
  },
  slots: { flexDirection: 'row', alignItems: 'stretch' },
  slot: { flex: 1, paddingHorizontal: 1, paddingVertical: 6 },
  slotFill: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: 12,
  },
  labelSlot: { width: '100%', justifyContent: 'flex-start' },
  label: { fontSize: 11, lineHeight: 14, textAlign: 'center', width: '100%' },
});
