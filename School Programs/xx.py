def p():
    for i in range(1,5):
        for j in range(1,i+1):
            print("*",end=" ")
        for k in range(i,4):
            print(" "*2,end="  ")
        for m in range(1,i+1):
            print("*",end=" ")
        print()
p()