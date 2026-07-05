import { Controller, Get, Post, Patch, Delete, Param, Body, NotFoundException } from "@nestjs/common";
import { UserService } from "./user.service";
import { CreateUserDto, UpdateUserDto } from "./user.dto";

@Controller("admin/users")
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  listUsers() {
    return this.userService.listUsers();
  }

  @Get("by-email/:email")
  async getUserByEmail(@Param("email") email: string) {
    const user = await this.userService.getUserByEmail(decodeURIComponent(email));
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return user;
  }

  @Get(":id")
  getUser(@Param("id") id: string) {
    return this.userService.getUser(id);
  }

  @Post()
  createUser(@Body() body: CreateUserDto) {
    return this.userService.createUser(body);
  }

  @Patch(":id")
  updateUser(@Param("id") id: string, @Body() body: UpdateUserDto) {
    return this.userService.updateUser(id, body);
  }

  @Delete(":id")
  deleteUser(@Param("id") id: string) {
    return this.userService.deleteUser(id);
  }
}
