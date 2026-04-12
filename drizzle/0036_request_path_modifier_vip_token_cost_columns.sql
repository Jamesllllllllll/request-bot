ALTER TABLE channel_settings
ADD COLUMN request_path_modifier_guitar_vip_token_cost integer NOT NULL DEFAULT 0;

ALTER TABLE channel_settings
ADD COLUMN request_path_modifier_lead_vip_token_cost integer NOT NULL DEFAULT 0;

ALTER TABLE channel_settings
ADD COLUMN request_path_modifier_rhythm_vip_token_cost integer NOT NULL DEFAULT 0;

ALTER TABLE channel_settings
ADD COLUMN request_path_modifier_bass_vip_token_cost integer NOT NULL DEFAULT 0;

UPDATE channel_settings
SET
  request_path_modifier_guitar_vip_token_cost = CASE
    WHEN json_valid(request_path_modifier_vip_token_costs_json)
      THEN coalesce(
        CAST(
          json_extract(
            request_path_modifier_vip_token_costs_json,
            '$.guitar'
          ) AS integer
        ),
        request_path_modifier_vip_token_cost,
        0
      )
    ELSE coalesce(request_path_modifier_vip_token_cost, 0)
  END,
  request_path_modifier_lead_vip_token_cost = CASE
    WHEN json_valid(request_path_modifier_vip_token_costs_json)
      THEN coalesce(
        CAST(
          json_extract(
            request_path_modifier_vip_token_costs_json,
            '$.lead'
          ) AS integer
        ),
        request_path_modifier_vip_token_cost,
        0
      )
    ELSE coalesce(request_path_modifier_vip_token_cost, 0)
  END,
  request_path_modifier_rhythm_vip_token_cost = CASE
    WHEN json_valid(request_path_modifier_vip_token_costs_json)
      THEN coalesce(
        CAST(
          json_extract(
            request_path_modifier_vip_token_costs_json,
            '$.rhythm'
          ) AS integer
        ),
        request_path_modifier_vip_token_cost,
        0
      )
    ELSE coalesce(request_path_modifier_vip_token_cost, 0)
  END,
  request_path_modifier_bass_vip_token_cost = CASE
    WHEN json_valid(request_path_modifier_vip_token_costs_json)
      THEN coalesce(
        CAST(
          json_extract(
            request_path_modifier_vip_token_costs_json,
            '$.bass'
          ) AS integer
        ),
        request_path_modifier_vip_token_cost,
        0
      )
    ELSE coalesce(request_path_modifier_vip_token_cost, 0)
  END;
