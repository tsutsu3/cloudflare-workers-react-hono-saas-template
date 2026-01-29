import unusedImports from "eslint-plugin-unused-imports";
import importPlugin from "eslint-plugin-import";

const eslintConfig = [
  {
    plugins: {
      "unused-imports": unusedImports,
      import: importPlugin,
    },
    rules: {
      // Turn off the base @typescript-eslint/no-unused-vars rule
      "@typescript-eslint/no-unused-vars": "off",
      // Use the unused-imports plugin to handle unused vars
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "error",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
      // eslint-plugin-import rules
      "import/no-unused-modules": [
        "error",
        {
          unusedExports: true,
          missingExports: false,
        },
      ],
    },
  },
  // Disable unused-modules rule for framework and config files
  {
    files: [
      "src/server/index.ts",        // Hono entry point
      "src/client/main.tsx",        // React entry point
      "src/client/routes/**/*.tsx", // TanStack Router files
      "*.config.ts",
      "*.config.js",
      "*.config.mjs",
    ],
    rules: {
      "import/no-unused-modules": "off",
    },
  },
];

export default eslintConfig;
