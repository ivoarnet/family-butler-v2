import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [
    "@storybook/addon-docs",
    "@storybook/addon-a11y",
    "@storybook/addon-vitest"
  ],
  framework: "@storybook/react-vite",
  async viteFinal(config) {
    config.optimizeDeps ??= {};
    config.optimizeDeps.include = [
      ...new Set([...(config.optimizeDeps.include ?? []), "react/jsx-dev-runtime"]),
    ];
    return config;
  },
};

export default config;