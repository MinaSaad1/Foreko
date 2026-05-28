import { useQuery } from"@tanstack/react-query";
import { api } from"@/api/endpoints";

export function useHealth() {
 return useQuery({
 queryKey: ["health"],
 queryFn: () => api.health(),
 refetchInterval: 5000,
 retry: 1,
 });
}
