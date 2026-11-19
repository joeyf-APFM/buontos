import { Database } from 'lucide-react';
import { FeatureAccessLevel } from '@/types/settings';
import { TileConfig } from '../types';
import { useDataProductsData } from './use-data-products-data';
import ContractStatusBreakdown from '@/components/home/contract-status-breakdown';

export const dataProductsTile: TileConfig = {
  id: 'data-products',
  icon: <Database className="h-4 w-4" />,
  titleKey: 'home:overview.tiles.dataProducts.title',
  descriptionKey: 'home:overview.tiles.dataProducts.description',
  link: '/data-products',
  permission: 'data-products',
  requiredLevel: FeatureAccessLevel.READ_ONLY,
  useTileData: useDataProductsData,
  renderContent: (data) => (
    <ContractStatusBreakdown to="/data-products" statusCounts={data.customData?.statusBreakdown || []} />
  ),
};
