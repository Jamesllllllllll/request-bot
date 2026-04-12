ALTER TABLE channel_settings
ADD COLUMN request_path_modifier_vip_token_costs_json text NOT NULL DEFAULT '{}';

UPDATE channel_settings
SET request_path_modifier_vip_token_costs_json = json_object(
  'guitar',
  request_path_modifier_vip_token_cost,
  'lead',
  request_path_modifier_vip_token_cost,
  'rhythm',
  request_path_modifier_vip_token_cost,
  'bass',
  request_path_modifier_vip_token_cost
);
