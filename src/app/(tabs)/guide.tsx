import { StyleSheet, View } from 'react-native';

import { RoutinePage } from '@/components/routinePage';
import { InkFooter, InkHeader, PageScroll, Sheet } from '@/components/ui';
import { usePaper } from '@/state/routine';

export default function GuideScreen() {
  const paper = usePaper();
  return (
    <View style={[styles.screen, { backgroundColor: paper.bg }]}>
      <InkFooter color={paper.text} back />
      <InkHeader color={paper.text} />
      <PageScroll keyboardShouldPersistTaps="handled">
        <Sheet paper={paper}>
          <RoutinePage paper={paper} />
        </Sheet>
      </PageScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
});
