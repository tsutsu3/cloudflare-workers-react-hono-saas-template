import { toast } from "sonner"
import ShinyButton from "@/client/components/ui/shiny-button"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/client/lib/api-client"
import type { PURCHASABLE_ITEM_TYPE } from "@/db/schema"

interface PurchaseButtonProps {
  itemId: string
  itemType: keyof typeof PURCHASABLE_ITEM_TYPE
}

export default function PurchaseButton({ itemId, itemType }: PurchaseButtonProps) {
  const queryClient = useQueryClient()

  const purchaseMutation = useMutation({
    mutationFn: async ({ itemId, itemType }: { itemId: string; itemType: string }) => {
      const response = await apiClient.post('/marketplace/purchase', { itemId, itemType })
      return response.data
    },
    onMutate: () => {
      toast.loading("Processing purchase...")
    },
    onError: (error: any) => {
      toast.dismiss();
      toast.error(error.response?.data?.error || "Failed to purchase item")
    },
    onSuccess: () => {
      toast.dismiss()
      toast.success("Item purchased successfully!")
      // Invalidate all relevant queries to update UI
      queryClient.invalidateQueries({ queryKey: ['session'] })
      queryClient.invalidateQueries({ queryKey: ['credits'] })
      queryClient.invalidateQueries({ queryKey: ['marketplace', 'purchased-items'] })
    },
  })

  return (
    <ShinyButton
      onClick={() => {
        purchaseMutation.mutate({ itemId, itemType })
      }}
    >
      {purchaseMutation.isPending ? "Processing..." : "Purchase"}
    </ShinyButton>
  )
}
