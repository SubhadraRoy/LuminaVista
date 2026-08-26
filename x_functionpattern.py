def pattern(): 
    for i in range(3,0,-1): 
        for k in range(3,i,-1): 
            print(" ",end="") 
        
        if i == 3:
            for f in range(6): 
                print("* ",end="")
        elif i == 2:
            for f in range(2): 
                print("* ",end="")
            for f in range(3): 
                print(" ",end="")
            for f in range(2): 
                print("* ",end="")
        else:
            for f in range(1): 
                print("* ",end="")
            for f in range(5): 
                print(" ",end="")
            for f in range(1): 
                print("* ",end="")
        
        print()

    for i in range(3,0,-1): 
        for k in range(3,i-1,-1): 
            print(" ",end="") 
        for f in range(i): 
            print("* ",end="") 
        print() 

pattern()