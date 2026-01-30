import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { apiClient } from "@/client/lib/api-client"
import { Input } from "@/client/components/ui/input"
import { Button } from "@/client/components/ui/button"
import { Skeleton } from "@/client/components/ui/skeleton"
import { Link } from "@tanstack/react-router"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table"
import { Avatar, AvatarFallback, AvatarImage } from "@/client/components/ui/avatar"
import { Badge } from "@/client/components/ui/badge"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface User {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  avatar: string | null
  isEmailVerified: boolean
  isAdmin: boolean
  createdAt: string
}

interface UsersData {
  users: User[]
  totalCount: number
  totalPages: number
  page: number
  pageSize: number
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

export function UsersTable() {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0])
  const [emailFilter, setEmailFilter] = useState("")

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-users', page, pageSize, emailFilter],
    queryFn: async () => {
      const response = await apiClient.get('/admin/users', {
        params: { page, pageSize, email: emailFilter || undefined }
      })
      return response.data as UsersData
    },
  })

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
  }

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize)
    setPage(1) // Reset to first page when changing page size
  }

  const handleEmailFilterChange = (value: string) => {
    setEmailFilter(value)
    setPage(1) // Reset to first page when filtering
  }

  if (isLoading) {
    return (
      <div className="p-6 w-full min-w-0 flex flex-col overflow-hidden">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between flex-shrink-0">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-64" />
        </div>
        <div className="mt-8 space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 w-full text-center text-red-500">
        Failed to load users. Please try again.
      </div>
    )
  }

  return (
    <div className="p-6 w-full min-w-0 flex flex-col overflow-hidden">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between flex-shrink-0">
        <h1 className="text-3xl font-bold">Users</h1>
        <Input
          placeholder="Filter emails..."
          type="search"
          value={emailFilter}
          onChange={(event) => handleEmailFilterChange(event.target.value)}
          className="max-w-sm"
        />
      </div>
      <div className="mt-8 flex-1 min-h-0">
        {!data || data.users.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No users found
          </div>
        ) : (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.users.map((user) => (
                    <TableRow key={user.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell>
                        <Link to={`/admin/users/${user.id}` as any} className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={user.avatar || ''} />
                            <AvatarFallback>
                              {user.firstName?.[0]}{user.lastName?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <span>
                            {user.firstName} {user.lastName}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        {user.isEmailVerified ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            Verified
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                            Unverified
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {user.isAdmin ? (
                          <Badge>Admin</Badge>
                        ) : (
                          <Badge variant="secondary">User</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {new Date(user.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, data.totalCount)} of {data.totalCount} users
              </div>
              <div className="flex items-center gap-4">
                <select
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size} per page
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm">
                    Page {page} of {data.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page >= data.totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
