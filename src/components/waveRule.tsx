import { useEffect } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, View } from 'react-native';

// One period of the picture, in density-independent pixels. The slide
// moves exactly this far, so the join between copies is invisible.
const PERIOD = 36;
const RULE_HEIGHT = 16;
const COPIES = 12;
const STRIP_WIDTH = PERIOD * COPIES;
const DRIFT_MS = 11000;

const drift = new Animated.Value(0);
let mounted = 0;
let reduceMotion = false;
let motionKnown = false;
let loop: Animated.CompositeAnimation | null = null;
let watched = false;

function syncDrift() {
  const run = mounted > 0 && motionKnown && !reduceMotion;
  if (run && loop === null) {
    loop = Animated.loop(
      Animated.timing(drift, {
        toValue: 1,
        duration: DRIFT_MS,
        easing: Easing.linear,
        useNativeDriver: true,
        isInteraction: false,
      }),
    );
    loop.start();
    return;
  }
  if (!run && loop !== null) {
    loop.stop();
    loop = null;
    drift.setValue(0);
  }
}

function watchMotion() {
  if (watched) return;
  watched = true;
  AccessibilityInfo.isReduceMotionEnabled()
    .then((enabled) => {
      reduceMotion = enabled;
      motionKnown = true;
      syncDrift();
    })
    .catch(() => {
      motionKnown = true;
      syncDrift();
    });
  AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
    reduceMotion = enabled;
    motionKnown = true;
    syncDrift();
  });
}

// Black ink on a clear ground. tintColor turns it into the sheet's ink,
// which is black on the light print and near-white on the dark print.
const source = require('../../assets/images/wave-rule.png');

export function WaveRule({ color, inset = 0 }: { color: string; inset?: number }) {
  useEffect(() => {
    mounted += 1;
    watchMotion();
    syncDrift();
    return () => {
      mounted -= 1;
      syncDrift();
    };
  }, []);

  const shift = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -PERIOD] });
  return (
    <View
      pointerEvents="none"
      collapsable={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.clip, { left: -inset, right: -inset }]}>
      <Animated.View style={[styles.track, { transform: [{ translateX: shift }] }]}>
        <Image source={source} fadeDuration={0} resizeMode="stretch" tintColor={color} style={styles.strip} />
        <Image source={source} fadeDuration={0} resizeMode="stretch" tintColor={color} style={styles.strip} />
      </Animated.View>
    </View>
  );
}

// A filled chip is sometimes a color. The line stays black or white,
// whichever one shows up on that fill.
export function monoOn(fill: string): '#000000' | '#FFFFFF' {
  const hex = fill.replace('#', '');
  if (hex.length !== 6) return '#000000';
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  if ([red, green, blue].some((channel) => Number.isNaN(channel))) return '#000000';
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.62 ? '#000000' : '#FFFFFF';
}

const styles = StyleSheet.create({
  // Sits on the top edge of the parent. Parents turn off their top stroke
  // and pad the text below this height, so the wave is the border.
  clip: {
    position: 'absolute',
    top: 0,
    height: RULE_HEIGHT,
    overflow: 'hidden',
  },
  track: {
    flexDirection: 'row',
    width: STRIP_WIDTH * 2,
    height: RULE_HEIGHT,
  },
  strip: {
    width: STRIP_WIDTH,
    height: RULE_HEIGHT,
  },
});
