import { Redirect } from 'expo-router';

/** A app abre sempre no ecrã de ligar (spec §6). */
export default function Index() {
  return <Redirect href="/connect" />;
}
