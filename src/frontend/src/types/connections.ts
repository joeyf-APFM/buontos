/** Branch stamped on assets a connection imports (Databricks assets are always Unity Catalog). */
export type ConnectionBranch = 'internal' | 'external';

export interface Connection {
  id: string;
  name: string;
  connector_type: string;
  description: string | null;
  config: Record<string, any>;
  enabled: boolean;
  is_default: boolean;
  system_asset_id: string | null;
  data_branch?: ConnectionBranch | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConnectionCreate {
  name: string;
  connector_type: string;
  description?: string;
  config: Record<string, any>;
  enabled?: boolean;
  is_default?: boolean;
  data_branch?: ConnectionBranch | null;
}

export interface ConnectionUpdate {
  name?: string;
  description?: string;
  config?: Record<string, any>;
  enabled?: boolean;
  is_default?: boolean;
  system_asset_id?: string | null;
  data_branch?: ConnectionBranch | null;
}

export interface ConnectorTypeInfo {
  connector_type: string;
  display_name: string;
  description: string;
  capabilities: Record<string, boolean>;
  config_fields: ConfigFieldHint[];
}

export interface ConfigFieldHint {
  name: string;
  required: boolean;
  description: string;
}
