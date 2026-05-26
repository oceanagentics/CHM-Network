PRAGMA foreign_keys = ON;

BEGIN;

INSERT INTO sources (
  id,
  title,
  source_type,
  url,
  local_path,
  publisher,
  published_at,
  accessed_at,
  note
) VALUES
  (
    'src-implementation-plan',
    'CHM Network Plan',
    'working_note',
    NULL,
    'implementation-plan.md',
    'Ocean Agentics',
    '2026-04-24',
    '2026-04-24',
    'Path-first graph plan focused on researcher publication and downstream system sync.'
  ),
  (
    'src-ioc-pitch',
    'Designing and implementing the BBNJ Clearing-House Mechanism (CHM): Contribution from the Intergovernmental Oceanographic Commission',
    'docx',
    'https://oceanagentics.slack.com/files/U0AQY6J9SG7/F0ARNA2MC5C/ioc_unesco_pitch_for_bbnj_chm_strategic_briefing_final__2_.docx',
    'research/2026-04-24-source-pack/raw/IOC Unesco Pitch for BBNJ CHM strategic briefing_final (2).docx',
    'IOC-UNESCO',
    '2026-03-23',
    '2026-04-24',
    'IOC pitch used as a source for the OBIS-to-CHM pathway.'
  ),
  (
    'src-obis-support',
    'A Digital Foundation for the BBNJ Agreement - Potential contributions of OBIS to the implementation of the High Seas Treaty',
    'web_article',
    'https://obis.org/2025/11/13/obis-support-to-bbnj/',
    'research/2026-04-24-source-pack/raw/obis-support-to-bbnj.html',
    'OBIS',
    '2025-11-13',
    '2026-04-24',
    'OBIS article positioning the platform as a likely CHM sync destination.'
  );

INSERT INTO entities (
  id,
  kind,
  name,
  slug,
  parent_entity_id,
  country_code,
  institution_type,
  technology_family,
  treaty_role,
  operational_role,
  confidentiality_class,
  status,
  maturity,
  confidence,
  description,
  properties_json,
  created_at,
  updated_at
) VALUES
  (
    'country-jpn',
    'country',
    'Japan',
    'japan',
    NULL,
    'JPN',
    NULL,
    NULL,
    NULL,
    NULL,
    'public',
    'active',
    'production',
    1.0,
    'Country anchor for the Japan publication pathway.',
    '{}',
    '2026-04-24T00:00:00Z',
    '2026-04-24T00:00:00Z'
  ),
  (
    'org-jamstec',
    'organization',
    'Japan Agency for Marine-Earth Science and Technology (JAMSTEC)',
    'jamstec',
    'country-jpn',
    'JPN',
    'research_institute',
    'marine_science',
    NULL,
    NULL,
    'public',
    'active',
    'production',
    0.95,
    'Top-level organization representing the Japanese publishing actor in the seed path.',
    '{}',
    '2026-04-24T00:00:00Z',
    '2026-04-24T00:00:00Z'
  ),
  (
    'system-bismal',
    'system',
    'BISMaL',
    'bismal',
    NULL,
    'JPN',
    NULL,
    'marine_biodiversity_data',
    NULL,
    NULL,
    'public',
    'active',
    'production',
    0.8,
    'Japanese biodiversity system that receives publication from JAMSTEC and syncs onward to OBIS.',
    '{"subtype":"database"}',
    '2026-04-24T00:00:00Z',
    '2026-04-24T00:00:00Z'
  ),
  (
    'platform-obis',
    'system',
    'Ocean Biodiversity Information System (OBIS)',
    'obis',
    NULL,
    NULL,
    NULL,
    'marine_biodiversity_platform',
    NULL,
    NULL,
    'public',
    'active',
    'production',
    0.98,
    'Global marine biodiversity system receiving synchronized data from BISMaL.',
    '{"subtype":"platform"}',
    '2026-04-24T00:00:00Z',
    '2026-04-24T00:00:00Z'
  ),
  (
    'platform-bbnj-chm',
    'system',
    'BBNJ Clearing-House Mechanism (CHM)',
    'bbnj-chm',
    NULL,
    NULL,
    NULL,
    'treaty_information_system',
    NULL,
    NULL,
    'public',
    'planned',
    'concept',
    0.98,
    'Planned downstream treaty system that may receive synchronized information from OBIS.',
    '{"subtype":"platform"}',
    '2026-04-24T00:00:00Z',
    '2026-04-24T00:00:00Z'
  );

INSERT INTO relationships (
  id,
  source_entity_id,
  target_entity_id,
  type,
  interface_entity_id,
  direction,
  status,
  confidence,
  access_modality,
  interoperability_mode,
  integration_tier,
  note,
  properties_json,
  created_at,
  updated_at
) VALUES
  (
    'rel-jamstec-part-of-japan',
    'org-jamstec',
    'country-jpn',
    'part_of',
    NULL,
    'outbound',
    'active',
    0.95,
    NULL,
    NULL,
    NULL,
    'JAMSTEC is part of the Japan country context for this view.',
    '{}',
    '2026-04-24T00:00:00Z',
    '2026-04-24T00:00:00Z'
  ),
  (
    'rel-jamstec-operates-bismal',
    'org-jamstec',
    'system-bismal',
    'operates',
    NULL,
    'outbound',
    'active',
    0.9,
    NULL,
    NULL,
    NULL,
    'JAMSTEC operates BISMaL.',
    '{}',
    '2026-04-24T00:00:00Z',
    '2026-04-24T00:00:00Z'
  ),
  (
    'rel-jamstec-publishes-to-bismal',
    'org-jamstec',
    'system-bismal',
    'publishes_to',
    NULL,
    'outbound',
    'active',
    0.8,
    NULL,
    NULL,
    NULL,
    'JAMSTEC researchers publish biodiversity data into BISMaL.',
    '{}',
    '2026-04-24T00:00:00Z',
    '2026-04-24T00:00:00Z'
  ),
  (
    'rel-bismal-syncs-to-obis',
    'system-bismal',
    'platform-obis',
    'syncs_to',
    NULL,
    'outbound',
    'active',
    0.85,
    NULL,
    NULL,
    NULL,
    'BISMaL synchronizes biodiversity data to OBIS.',
    '{"transferMethod":"IPT","format":"Darwin Core Archive","standard":"Darwin Core"}',
    '2026-04-24T00:00:00Z',
    '2026-04-24T00:00:00Z'
  ),
  (
    'rel-obis-syncs-to-chm',
    'platform-obis',
    'platform-bbnj-chm',
    'syncs_to',
    NULL,
    'outbound',
    'planned',
    0.9,
    NULL,
    NULL,
    NULL,
    'OBIS is a likely downstream synchronization source for the planned CHM.',
    '{"connectionType":"planned_federation"}',
    '2026-04-24T00:00:00Z',
    '2026-04-24T00:00:00Z'
  );

INSERT INTO entity_sources (
  entity_id,
  source_id,
  claim_type,
  excerpt,
  confidence_override
) VALUES
  (
    'system-bismal',
    'src-implementation-plan',
    'seed_system',
    'The working note uses BISMaL as the concrete Japanese publication system.',
    0.8
  ),
  (
    'platform-obis',
    'src-obis-support',
    'downstream_system',
    'OBIS presents itself as a mature platform that can support CHM implementation.',
    0.95
  ),
  (
    'platform-bbnj-chm',
    'src-ioc-pitch',
    'planned_destination',
    'The IOC pitch describes the planned CHM as the downstream treaty mechanism.',
    0.95
  );

INSERT INTO relationship_sources (
  relationship_id,
  source_id,
  claim_type,
  excerpt,
  confidence_override
) VALUES
  (
    'rel-bismal-syncs-to-obis',
    'src-implementation-plan',
    'seed_sync_path',
    'The note uses BISMaL -> OBIS via IPT and Darwin Core Archive as the seed sync path.',
    0.85
  ),
  (
    'rel-obis-syncs-to-chm',
    'src-obis-support',
    'obis_to_chm_path',
    'OBIS frames itself as positioned to support CHM operationalization.',
    0.9
  );

INSERT INTO saved_views (
  id,
  name,
  scope,
  filter_json,
  layout_json,
  style_json,
  created_at,
  updated_at
) VALUES
  (
    'view-japan-country-path',
    'Japan publication path',
    'country-jpn',
    '{"viewMode":"country","focusEntityId":"country-jpn"}',
    '{"algorithm":"breadthfirst"}',
    '{}',
    '2026-04-24T00:00:00Z',
    '2026-04-24T00:00:00Z'
  ),
  (
    'view-bismal-technical-path',
    'BISMaL technical path',
    'system-bismal',
    '{"viewMode":"technical","focusEntityId":"system-bismal"}',
    '{"algorithm":"breadthfirst"}',
    '{}',
    '2026-04-24T00:00:00Z',
    '2026-04-24T00:00:00Z'
  );

COMMIT;
