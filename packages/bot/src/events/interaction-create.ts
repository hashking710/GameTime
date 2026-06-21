import type { Interaction } from "discord.js";
import { createLogger } from "@gametime/shared";

const logger = createLogger("bot:interaction");

export async function handleInteraction(interaction: Interaction) {
  if (interaction.isAutocomplete()) {
    const command = interaction.client.commands.get(
      interaction.commandName,
    );
    if (!command?.autocomplete) return;

    try {
      await command.autocomplete(interaction);
    } catch (err) {
      logger.error({ err, command: interaction.commandName }, "Autocomplete error");
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands.get(interaction.commandName);
  if (!command) {
    logger.warn({ command: interaction.commandName }, "Unknown command");
    return;
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    logger.error({ err, command: interaction.commandName }, "Command error");
    const reply = {
      content: "Something went wrong. Please try again later.",
      ephemeral: true,
    };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(reply);
    } else {
      await interaction.reply(reply);
    }
  }
}
