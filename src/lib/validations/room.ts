import { z } from 'zod'

export const roomSchema = z.object({
  name: z.string().min(1, 'Room name is required'),
  type: z.enum(['standard', 'deluxe', 'suite', 'dormitory']),
  base_rate: z
    .number()
    .min(1, 'Rate must be at least ₹1')
    .max(999999, 'Rate seems too high'),
  max_occupancy: z
    .number()
    .int()
    .min(1, 'Must accommodate at least 1 guest')
    .max(20, 'Maximum 20 guests per room'),
  amenities: z.array(z.string()).default([]),
  floor: z
    .number()
    .int()
    .min(0)
    .max(50)
    .optional(),
  description: z.string().max(500, 'Description too long').optional(),
})

export type RoomFormData = z.infer<typeof roomSchema>
