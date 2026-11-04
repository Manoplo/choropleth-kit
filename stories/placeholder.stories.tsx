import type { Meta, StoryObj } from "@storybook/react-vite";
import { Placeholder } from "../src/react";

const meta = { title: "Setup/Placeholder", component: Placeholder } satisfies Meta<typeof Placeholder>;

export default meta;

export const Default: StoryObj<typeof meta> = {};
