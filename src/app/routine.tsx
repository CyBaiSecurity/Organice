import { Redirect, type Href } from 'expo-router';

const guideHref = '/guide' as Href;

export default function RoutineRedirect() {
  return <Redirect href={guideHref} />;
}
