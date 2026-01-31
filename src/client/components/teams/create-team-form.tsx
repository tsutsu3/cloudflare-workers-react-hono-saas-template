import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Textarea } from "@/client/components/ui/textarea";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/client/components/ui/form";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/client/lib/api-client";

const formSchema = z.object({
  name: z.string().min(1, "Team name is required").max(100, "Team name is too long"),
  description: z.string().max(1000, "Description is too long").optional(),
  avatarUrl: z.string().url("Invalid URL").max(600, "URL is too long").optional().or(z.literal("")),
});

type FormValues = z.infer<typeof formSchema>;

export function CreateTeamForm() {
  const navigate = useNavigate();

  const createTeamMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const response = await apiClient.post('/teams', data);
      return response.data;
    },
    onMutate: () => {
      toast.loading("Creating team...");
    },
    onError: (error: any) => {
      toast.dismiss();
      toast.error(error.response?.data?.error || "Failed to create team");
    },
    onSuccess: (result) => {
      toast.dismiss();
      toast.success("Team created successfully");
      navigate({ to: `/dashboard/teams/${result.data.slug}` });
    }
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      avatarUrl: "",
    },
  });

  function onSubmit(data: FormValues) {
    // Clean up empty string in avatarUrl if present
    const formData = {
      ...data,
      avatarUrl: data.avatarUrl || undefined
    };

    createTeamMutation.mutate(formData);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Team Name</FormLabel>
              <FormControl>
                <Input placeholder="Enter team name" {...field} />
              </FormControl>
              <FormDescription>
                A unique name for your team
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Enter a brief description of your team"
                  {...field}
                  value={field.value || ""}
                />
              </FormControl>
              <FormDescription>
                Optional description of your team&apos;s purpose
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={createTeamMutation.isPending}>
          {createTeamMutation.isPending ? "Creating..." : "Create Team"}
        </Button>
      </form>
    </Form>
  );
}
