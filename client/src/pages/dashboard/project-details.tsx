import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardList, MessageSquare, Users, FileText } from "lucide-react";
import type { Project } from "@db/schema";

export default function ProjectDetails() {
  const { id } = useParams();
  const [_, setLocation] = useLocation();

  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ["api/projects", id],
    queryFn: () => fetch(`/api/projects/${id}`).then(res => res.json())
  });

  if (isLoading || !project) {
    return <div>Loading...</div>;
  }

  const cards = [
    {
      title: "Tasks",
      icon: ClipboardList,
      description: "Manage and track project tasks in Kanban view",
      path: `/dashboard/projects/${id}/tasks`
    },
    {
      title: "Team Chat",
      icon: MessageSquare,
      description: "Internal communication between team members",
      path: `/dashboard/projects/${id}/team-chat`
    },
    {
      title: "Client Communication",
      icon: Users,
      description: "Direct communication channel with the client",
      path: `/dashboard/projects/${id}/client-chat`
    },
    {
      title: "Resources",
      icon: FileText,
      description: "Project documents and important files",
      path: `/dashboard/projects/${id}/resources`
    }
  ];

  return (
    <div className="flex h-screen">
      <Sidebar currentPath={`/dashboard/projects/${id}`} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 overflow-auto p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <p className="text-muted-foreground">{project.description}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <Card 
                  key={card.title}
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => setLocation(card.path)}
                >
                  <CardHeader className="flex flex-row items-center gap-4">
                    <Icon className="h-6 w-6" />
                    <div>
                      <h3 className="text-lg font-semibold">{card.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {card.description}
                      </p>
                    </div>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}