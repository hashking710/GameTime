import type {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from "discord.js";

import trackCommand from "./track";
import untrackCommand from "./untrack";
import upcomingCommand from "./upcoming";
import todayCommand from "./today";
import liveCommand from "./live";
import scheduleCommand from "./schedule";
import oddsCommand from "./odds";
import tierCommand from "./tier";
import settingsCommand from "./settings";
import subscribeCommand from "./subscribe";
import helpCommand from "./help";

export interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

export function loadCommands(): Command[] {
  return [
    trackCommand,
    untrackCommand,
    upcomingCommand,
    todayCommand,
    liveCommand,
    scheduleCommand,
    oddsCommand,
    tierCommand,
    settingsCommand,
    subscribeCommand,
    helpCommand,
  ];
}
