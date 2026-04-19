CREATE TABLE `youtube_authorizations` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `channel_id` text NOT NULL,
  `youtube_channel_id` text NOT NULL,
  `channel_title` text NOT NULL,
  `channel_custom_url` text,
  `thumbnail_url` text,
  `access_token_encrypted` text NOT NULL,
  `refresh_token_encrypted` text,
  `scopes` text NOT NULL,
  `token_type` text NOT NULL,
  `expires_at` integer,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX `youtube_authorizations_channel_uidx`
  ON `youtube_authorizations` (`channel_id`);

CREATE UNIQUE INDEX `youtube_authorizations_youtube_channel_uidx`
  ON `youtube_authorizations` (`youtube_channel_id`);

CREATE INDEX `youtube_authorizations_user_idx`
  ON `youtube_authorizations` (`user_id`);
