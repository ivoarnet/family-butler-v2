import type { Preview } from '@storybook/react-vite'
import "../src/App.css";
import { AppThemeProvider } from "../src/shared/theme/AppThemeProvider";

const preview: Preview = {
  decorators: [
    (Story) => (
      <AppThemeProvider>
        <Story />
      </AppThemeProvider>
    ),
  ],
  parameters: {
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },
  },
};

export default preview;