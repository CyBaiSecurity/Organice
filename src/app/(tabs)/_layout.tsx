import { useContext } from 'react';
import { Easing, Pressable, Text, View, useColorScheme, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs } from 'expo-router/js-tabs';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { BottomTabBarHeightCallbackContext } from 'expo-router/build/react-navigation/bottom-tabs/utils/BottomTabBarHeightCallbackContext';

import { DOCK_HEIGHT, PILL_HEIGHT, TAB_CIRCLE, dockBottomInset, glassTint } from '@/theme/dock';
import { PAPER, type Paper } from '@/theme/palette';
import { useOrganice } from '@/state/organice';

const INNER = 50;
const LABEL_LIFT = 13;

const labelText = {
  textAlign: 'center' as const,
  fontSize: 8,
  fontWeight: '700' as const,
  letterSpacing: 0.4,
  textTransform: 'uppercase' as const,
  fontFamily: 'Georgia',
};

const TAB_ICONS: Record<string, SymbolViewProps['name']> = {
  index: { ios: 'square.grid.2x2', android: 'space_dashboard', web: 'space_dashboard' },
  todo: { ios: 'list.bullet', android: 'format_list_bulleted', web: 'format_list_bulleted' },
  tasks: { ios: 'checklist', android: 'checklist', web: 'checklist' },
  ideas: { ios: 'lightbulb', android: 'lightbulb', web: 'lightbulb' },
  calendar: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
};

function GlassDock({
  state,
  descriptors,
  navigation,
  paper,
  dockBottom,
}: BottomTabBarProps & { paper: Paper; dockBottom: number }) {
  const reportHeight = useContext(BottomTabBarHeightCallbackContext);

  return (
    <View
      pointerEvents="box-none"
      onLayout={(event) => reportHeight?.(event.nativeEvent.layout.height)}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 2,
        paddingBottom: dockBottom,
        paddingHorizontal: 16,
      }}>
      <View pointerEvents="box-none" style={{ height: DOCK_HEIGHT }}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: PILL_HEIGHT,
          borderRadius: PILL_HEIGHT / 2,
          backgroundColor: glassTint(paper.surface),
          borderWidth: 1,
          borderTopWidth: 1,
          borderRightWidth: 1,
          borderBottomWidth: 1,
          borderLeftWidth: 1,
          borderColor: paper.text,
          borderTopColor: paper.text,
          borderRightColor: paper.text,
          borderBottomColor: paper.text,
          borderLeftColor: paper.text,
          elevation: 0,
        }}
      />
      <View pointerEvents="box-none" style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end' }}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const { options } = descriptors[route.key];
          const title = options.title ?? route.name;
          const iconName = TAB_ICONS[route.name];
          const iconColor: ColorValue = focused ? paper.bg : paper.text;
          const labelColor = paper.text;
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
              accessibilityLabel={title}
              onPress={onPress}
              style={{ flex: 1, height: focused ? DOCK_HEIGHT : PILL_HEIGHT }}>
              {focused ? (
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <View
                    style={{
                      width: TAB_CIRCLE,
                      height: TAB_CIRCLE,
                      borderRadius: TAB_CIRCLE / 2,
                      backgroundColor: paper.bg,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <View
                      style={{
                        width: INNER,
                        height: INNER,
                        borderRadius: INNER / 2,
                        backgroundColor: paper.text,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      {iconName ? <SymbolView name={iconName} size={22} tintColor={iconColor} weight="regular" /> : null}
                    </View>
                  </View>
                  <Text style={[labelText, { color: labelColor, position: 'absolute', left: 0, right: 0, bottom: LABEL_LIFT }]}>
                    {title}
                  </Text>
                </View>
              ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  {iconName ? <SymbolView name={iconName} size={22} tintColor={iconColor} weight="regular" /> : null}
                  <Text style={[labelText, { color: labelColor }]}>{title}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
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
      <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="todo" options={{ title: 'To-do' }} />
      <Tabs.Screen name="tasks" options={{ title: 'Tasks' }} />
      <Tabs.Screen name="ideas" options={{ title: 'Ideas' }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar' }} />
      </Tabs>
    </View>
  );
}
