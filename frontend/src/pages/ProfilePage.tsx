import { ComponentProps } from "react";
import { SettingsPage } from "./SettingsPage";

type ProfilePageProps = Omit<ComponentProps<typeof SettingsPage>, "mode">;

export function ProfilePage(props: ProfilePageProps) {
  return <SettingsPage {...props} mode="profile" />;
}
