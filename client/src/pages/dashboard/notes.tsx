import { useState, useEffect, useCallback, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  Save, 
  FileText, 
  CheckSquare,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Type
} from "lucide-react";
import { format } from "date-fns";

interface Note {
  id: number;
  title: string;
  content: string;
  type: "freetext" | "todo";
  todoItems?: TodoItem[];
  createdAt: string;
  updatedAt: string;
}

interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
}

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const applyFormatting = useCallback((format: string) => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);

    let formattedText = "";
    let newCursorPos = end;

    switch (format) {
      case "bold":
        formattedText = `**${selectedText}**`;
        newCursorPos = selectedText ? end + 4 : start + 4;
        break;
      case "italic":
        formattedText = `*${selectedText}*`;
        newCursorPos = selectedText ? end + 2 : start + 2;
        break;
      case "underline":
        formattedText = `<u>${selectedText}</u>`;
        newCursorPos = selectedText ? end + 7 : start + 7;
        break;
      case "bullet":
        const bulletText = selectedText || "List item";
        formattedText = `• ${bulletText}`;
        newCursorPos = start + formattedText.length;
        break;
      case "numbered":
        const numberedText = selectedText || "List item";
        formattedText = `1. ${numberedText}`;
        newCursorPos = start + formattedText.length;
        break;
      default:
        return;
    }

    const newValue = value.substring(0, start) + formattedText + value.substring(end);
    onChange(newValue);

    // Set cursor position after formatting
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  }, [value, onChange, textareaRef]);

  return (
    <div className="space-y-2">
      <div className="flex gap-1 p-2 border rounded-t-md bg-gray-50">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => applyFormatting("bold")}
          className="h-8 w-8 p-0"
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => applyFormatting("italic")}
          className="h-8 w-8 p-0"
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => applyFormatting("underline")}
          className="h-8 w-8 p-0"
        >
          <Underline className="h-4 w-4" />
        </Button>
        <Separator orientation="vertical" className="h-6 my-1" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => applyFormatting("bullet")}
          className="h-8 w-8 p-0"
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => applyFormatting("numbered")}
          className="h-8 w-8 p-0"
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
      </div>
      <Textarea
        ref={(ref) => (textareaRef.current = ref)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-[200px] rounded-t-none border-t-0 font-mono text-sm"
        onSelect={(e) => {
          const target = e.target as HTMLTextAreaElement;
          setSelection({ start: target.selectionStart, end: target.selectionEnd });
        }}
      />
    </div>
  );
}

export default function Notes() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State management
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // Form state
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    type: "freetext" as "freetext" | "todo",
    todoItems: [] as TodoItem[],
  });

  // Access control - only operations managers
  const isOperationsManager = user?.role === "operations_manager" || user?.specialization === "operations_manager";

  console.log("Notes page - user:", user);
  console.log("Notes page - isOperationsManager:", isOperationsManager);

  if (!isOperationsManager) {
    return (
      <div className="flex h-screen w-full">
        <Sidebar currentPath={location} />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <Header />
          <div className="flex-1 overflow-auto p-6 w-full">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-900">Access Denied</h1>
              <p className="text-gray-600 mt-2">This page is only available to operations managers.</p>
              <p className="text-sm text-gray-500 mt-1">Your role: {user?.role}, Specialization: {user?.specialization || 'none'}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Fetch notes
  const { data: notes = [], isLoading, error } = useQuery<Note[]>({
    queryKey: ["/api/notes"],
  });

  console.log("Notes query - isLoading:", isLoading, "error:", error, "notes:", notes);

  // Create note mutation
  const createNoteMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create note");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      setIsCreateDialogOpen(false);
      resetForm();
      toast({
        title: "Success",
        description: "Note created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update note mutation
  const updateNoteMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const response = await fetch(`/api/notes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update note");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      setIsEditDialogOpen(false);
      setSelectedNote(null);
      resetForm();
      toast({
        title: "Success",
        description: "Note updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete note mutation
  const deleteNoteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/notes/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete note");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      toast({
        title: "Success",
        description: "Note deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      title: "",
      content: "",
      type: "freetext",
      todoItems: [],
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.content.trim() && formData.todoItems.length === 0) {
      toast({
        title: "Error",
        description: "Please add some content or todo items",
        variant: "destructive",
      });
      return;
    }

    if (selectedNote) {
      updateNoteMutation.mutate({ id: selectedNote.id, ...formData });
    } else {
      createNoteMutation.mutate(formData);
    }
  };

  const handleEditNote = (note: Note) => {
    setSelectedNote(note);
    setFormData({
      title: note.title,
      content: note.content,
      type: note.type,
      todoItems: note.todoItems || [],
    });
    setIsEditDialogOpen(true);
  };

  const addTodoItem = () => {
    const newItem: TodoItem = {
      id: Date.now().toString(),
      text: "",
      completed: false,
    };
    setFormData(prev => ({
      ...prev,
      todoItems: [...prev.todoItems, newItem],
    }));
  };

  const updateTodoItem = (id: string, updates: Partial<TodoItem>) => {
    setFormData(prev => ({
      ...prev,
      todoItems: prev.todoItems.map(item =>
        item.id === id ? { ...item, ...updates } : item
      ),
    }));
  };

  const removeTodoItem = (id: string) => {
    setFormData(prev => ({
      ...prev,
      todoItems: prev.todoItems.filter(item => item.id !== id),
    }));
  };

  const filteredNotes = notes.filter(note =>
    note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    note.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getPreviewText = (note: Note) => {
    if (note.type === "todo" && note.todoItems) {
      const completedCount = note.todoItems.filter(item => item.completed).length;
      return `${completedCount}/${note.todoItems.length} items completed`;
    }
    return note.content.substring(0, 100) + (note.content.length > 100 ? "..." : "");
  };

  if (isLoading) {
    return (
      <div className="flex h-screen w-full">
        <Sidebar currentPath={location} />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <Header />
          <div className="flex-1 overflow-auto p-6 w-full">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header />
        <div className="flex-1 overflow-auto p-3 sm:p-4 lg:p-6 w-full">
          <div className="w-full space-y-4 lg:space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                  <FileText className="h-8 w-8 text-blue-600" />
                  Notes
                </h1>
                <p className="text-gray-600 mt-1">
                  Create and manage your personal notes and todo lists
                </p>
              </div>

              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={resetForm}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Note
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Create New Note</DialogTitle>
                    <DialogDescription>
                      Create a free-text note or todo list
                    </DialogDescription>
                  </DialogHeader>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <Label htmlFor="title">Note Title (Optional)</Label>
                      <Input
                        id="title"
                        value={formData.title}
                        onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                        placeholder="Enter note title"
                      />
                    </div>

                    <div>
                      <Label htmlFor="type">Note Type</Label>
                      <Select 
                        value={formData.type} 
                        onValueChange={(value: "freetext" | "todo") => {
                          setFormData(prev => ({ ...prev, type: value }));
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select note type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="freetext">
                            <div className="flex items-center gap-2">
                              <Type className="h-4 w-4" />
                              Free Text
                            </div>
                          </SelectItem>
                          <SelectItem value="todo">
                            <div className="flex items-center gap-2">
                              <CheckSquare className="h-4 w-4" />
                              Todo List
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {formData.type === "freetext" ? (
                      <div>
                        <Label htmlFor="content">Content</Label>
                        <RichTextEditor
                          value={formData.content}
                          onChange={(value) => setFormData(prev => ({ ...prev, content: value }))}
                          placeholder="Type your note here... Use the toolbar above for formatting."
                        />
                      </div>
                    ) : (
                      <div>
                        <Label>Todo Items</Label>
                        <div className="space-y-2">
                          {formData.todoItems.map((item) => (
                            <div key={item.id} className="flex items-center gap-2">
                              <Checkbox
                                checked={item.completed}
                                onCheckedChange={(checked) =>
                                  updateTodoItem(item.id, { completed: checked as boolean })
                                }
                              />
                              <Input
                                value={item.text}
                                onChange={(e) => updateTodoItem(item.id, { text: e.target.value })}
                                placeholder="Todo item"
                                className="flex-1"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeTodoItem(item.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            onClick={addTodoItem}
                            className="w-full"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Todo Item
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end space-x-2 pt-4">
                      <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createNoteMutation.isPending}>
                        <Save className="w-4 h-4 mr-2" />
                        {createNoteMutation.isPending ? "Saving..." : "Save Note"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Notes List */}
            <div className="grid gap-6">
              {filteredNotes.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-10">
                    <FileText className="h-12 w-12 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      {notes.length === 0 ? "No notes created yet" : "No notes match your search"}
                    </h3>
                    <p className="text-gray-500 text-center mb-4">
                      {notes.length === 0 
                        ? "Create your first note to get started" 
                        : "Try a different search term"
                      }
                    </p>
                    {notes.length === 0 && (
                      <Button onClick={() => setIsCreateDialogOpen(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Create First Note
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                filteredNotes.map((note) => (
                  <Card key={note.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-xl">
                              {note.title || "Untitled Note"}
                            </CardTitle>
                            <Badge variant="outline" className="text-xs">
                              {note.type === "freetext" ? (
                                <div className="flex items-center gap-1">
                                  <Type className="h-3 w-3" />
                                  Text
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <CheckSquare className="h-3 w-3" />
                                  Todo
                                </div>
                              )}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-500">
                            {format(new Date(note.updatedAt), "MMM d, yyyy 'at' h:mm a")}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditNote(note)}
                          >
                            <Edit3 className="w-4 h-4 mr-1" />
                            Edit
                          </Button>

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="outline">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Note</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete this note? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteNoteMutation.mutate(note.id)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent>
                      <p className="text-gray-600 line-clamp-3">
                        {getPreviewText(note)}
                      </p>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Note</DialogTitle>
            <DialogDescription>
              Make changes to your note
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="edit-title">Note Title (Optional)</Label>
              <Input
                id="edit-title"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Enter note title"
              />
            </div>

            <div>
              <Label htmlFor="edit-type">Note Type</Label>
              <Select 
                value={formData.type} 
                onValueChange={(value: "freetext" | "todo") => {
                  setFormData(prev => ({ ...prev, type: value }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select note type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="freetext">
                    <div className="flex items-center gap-2">
                      <Type className="h-4 w-4" />
                      Free Text
                    </div>
                  </SelectItem>
                  <SelectItem value="todo">
                    <div className="flex items-center gap-2">
                      <CheckSquare className="h-4 w-4" />
                      Todo List
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.type === "freetext" ? (
              <div>
                <Label htmlFor="edit-content">Content</Label>
                <RichTextEditor
                  value={formData.content}
                  onChange={(value) => setFormData(prev => ({ ...prev, content: value }))}
                  placeholder="Type your note here... Use the toolbar above for formatting."
                />
              </div>
            ) : (
              <div>
                <Label>Todo Items</Label>
                <div className="space-y-2">
                  {formData.todoItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={item.completed}
                        onCheckedChange={(checked) =>
                          updateTodoItem(item.id, { completed: checked as boolean })
                        }
                      />
                      <Input
                        value={item.text}
                        onChange={(e) => updateTodoItem(item.id, { text: e.target.value })}
                        placeholder="Todo item"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeTodoItem(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addTodoItem}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Todo Item
                  </Button>
                </div>
              </div>
            )}

            <div className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateNoteMutation.isPending}>
                <Save className="w-4 h-4 mr-2" />
                {updateNoteMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}