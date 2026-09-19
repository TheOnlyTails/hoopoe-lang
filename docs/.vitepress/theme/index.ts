import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import HoopoeDebugger from "./components/HoopoeDebugger.vue";
import "./theme.css";

export default {
	extends: DefaultTheme,
	enhanceApp({ app }) {
		app.component("HoopoeDebugger", HoopoeDebugger);
	},
} satisfies Theme;
